# Tutorial 12: Python API with Storage

Build a REST API with Python 3.13, PostgreSQL, and S3 file uploads.

## What is OpenKBS Elastic?

**OpenKBS Elastic** lets you deploy full-stack applications with zero infrastructure setup. Instead of configuring AWS, databases, and CDNs manually, you get production-ready services with simple CLI commands.

| Service | What You Get | Used In This Tutorial |
|---------|--------------|----------------------|
| **Postgres** | PostgreSQL database (Neon) | Store items, media records |
| **Storage** | S3 bucket + CloudFront CDN | File uploads |
| **Functions** | Serverless Lambda APIs | Python endpoint |

```bash
openkbs postgres enable    # Database ready in 10 seconds
openkbs storage enable     # S3 bucket with CDN
openkbs fn push api        # Deploy your API
openkbs deploy             # Ship everything
```

> 📚 **Full documentation:** [Elastic Services Reference](/docs/elastic/)

---

## Prerequisites

### 1. Create OpenKBS Account

1. Go to [openkbs.com](https://openkbs.com) and create your account
2. Top up your account balance

### 2. Install White-Label Agent

1. Open **Marketplace** from the sidebar
2. Find **"AI White Label"** agent and click **Install**
3. Once installed, open the agent and go to **Platform Setup**

### 3. Register Your Domain

In **Platform Setup**:
1. Click **Register Domain**
2. Search for an available domain (e.g., `myapp.click`)
3. Complete the registration
4. Your app will be live at `https://<your-domain>`

### 4. Install CLI and Get kbId

```bash
npm install -g openkbs
openkbs login
openkbs ls
```

Note your `kbId` - you'll need it for `functions/settings.json`.

---

## Project Structure

```
python-demo/
├── openkbs.json
├── functions/
│   ├── settings.json
│   └── api/
│       ├── handler.py
│       └── requirements.txt
└── site/
    └── index.html
```

## 1. Configuration

`openkbs.json`:
```json
{
  "name": "python-demo",
  "region": "us-east-1",

  "elastic": {
    "postgres": true,
    "storage": {
      "cloudfront": "media"
    }
  },

  "functions": [
    {
      "name": "api",
      "runtime": "python3.13",
      "handler": "handler.main",
      "memory": 256,
      "timeout": 30
    }
  ],

  "site": "./site"
}
```

`functions/settings.json` (use the `kbId` from `openkbs ls`):
```json
{
  "kbId": "your-kb-id",
  "region": "us-east-1"
}
```

## 2. Dependencies

`functions/api/requirements.txt`:
```
pg8000
```

> **Note:** We use `pg8000` (pure Python) instead of `psycopg2-binary` because psycopg2 has platform-specific binaries that don't work across macOS/Linux. `boto3` is pre-installed in AWS Lambda.

## 3. Handler

`functions/api/handler.py`:
```python
import json
import os
import base64
import uuid
import pg8000
import boto3
from urllib.parse import urlparse

# Global connections (reused across invocations)
db_conn = None
db_error = None
s3_client = None
s3_bucket = os.environ.get('STORAGE_BUCKET')

try:
    db_url = os.environ.get('DATABASE_URL')
    if db_url:
        parsed = urlparse(db_url)
        db_conn = pg8000.connect(
            host=parsed.hostname,
            port=parsed.port or 5432,
            database=parsed.path[1:],
            user=parsed.username,
            password=parsed.password,
            ssl_context=True
        )
        db_conn.autocommit = True

        cur = db_conn.cursor()
        cur.execute('''
            CREATE TABLE IF NOT EXISTS items (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        cur.execute('''
            CREATE TABLE IF NOT EXISTS media (
                id SERIAL PRIMARY KEY,
                filename VARCHAR(255) NOT NULL,
                s3_key VARCHAR(500) NOT NULL,
                content_type VARCHAR(100),
                size_bytes INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        cur.close()
except Exception as e:
    db_error = str(e)

if s3_bucket:
    s3_client = boto3.client('s3')


def main(event, context):
    headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
    }

    try:
        body = json.loads(event.get('body') or '{}')
        action = body.get('action', 'status')

        if action == 'list':
            result = list_items()
        elif action == 'create':
            result = create_item(body)
        elif action == 'delete':
            result = delete_item(body)
        elif action == 'upload':
            result = upload_media(body)
        elif action == 'list-media':
            result = list_media()
        elif action == 'delete-media':
            result = delete_media(body)
        else:
            result = {
                'status': 'ok',
                'python': '3.13',
                'db': db_conn is not None,
                'storage': s3_bucket is not None,
                'dbError': db_error or ''
            }

        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps(result)
        }

    except Exception as e:
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({'error': str(e)})
        }


def list_items():
    if not db_conn:
        raise Exception(f'Database not connected: {db_error}')

    cur = db_conn.cursor()
    cur.execute('SELECT id, name, description, created_at FROM items ORDER BY created_at DESC LIMIT 50')
    rows = cur.fetchall()
    cur.close()
    return [
        {
            'id': row[0],
            'name': row[1],
            'description': row[2] or '',
            'createdAt': str(row[3])
        }
        for row in rows
    ]


def create_item(body):
    if not db_conn:
        raise Exception(f'Database not connected: {db_error}')

    name = body.get('name')
    description = body.get('description', '')

    cur = db_conn.cursor()
    cur.execute(
        'INSERT INTO items (name, description) VALUES (%s, %s) RETURNING id, created_at',
        (name, description)
    )
    row = cur.fetchone()
    cur.close()
    return {
        'id': row[0],
        'name': name,
        'description': description,
        'createdAt': str(row[1])
    }


def delete_item(body):
    if not db_conn:
        raise Exception(f'Database not connected: {db_error}')

    item_id = body.get('id')

    cur = db_conn.cursor()
    cur.execute('DELETE FROM items WHERE id = %s', (item_id,))
    deleted = cur.rowcount > 0
    cur.close()
    return {'deleted': deleted}


def upload_media(body):
    if not db_conn:
        raise Exception(f'Database not connected: {db_error}')
    if not s3_client:
        raise Exception('Storage not configured')

    filename = body.get('filename', 'file')
    content_type = body.get('contentType', 'application/octet-stream')
    data = body.get('data')  # base64 encoded

    if not data:
        raise Exception('No file data provided')

    file_bytes = base64.b64decode(data)
    s3_key = f"media/{uuid.uuid4()}/{filename}"

    s3_client.put_object(
        Bucket=s3_bucket,
        Key=s3_key,
        Body=file_bytes,
        ContentType=content_type
    )

    # Use CloudFront URL
    url = f"/{s3_key}"

    with db_conn.cursor() as cur:
        cur.execute(
            'INSERT INTO media (filename, s3_key, content_type, size_bytes) VALUES (%s, %s, %s, %s) RETURNING id, created_at',
            (filename, s3_key, content_type, len(file_bytes))
        )
        row = cur.fetchone()
        return {
            'id': row[0],
            'filename': filename,
            's3Key': s3_key,
            'url': url,
            'createdAt': str(row[1])
        }


def list_media():
    if not db_conn:
        raise Exception(f'Database not connected: {db_error}')

    with db_conn.cursor() as cur:
        cur.execute('SELECT id, filename, s3_key, content_type, size_bytes, created_at FROM media ORDER BY created_at DESC LIMIT 50')
        rows = cur.fetchall()
        return [
            {
                'id': row[0],
                'filename': row[1],
                's3Key': row[2],
                'url': f"/{row[2]}",
                'contentType': row[3],
                'sizeBytes': row[4],
                'createdAt': str(row[5])
            }
            for row in rows
        ]


def delete_media(body):
    if not db_conn:
        raise Exception(f'Database not connected: {db_error}')
    if not s3_client:
        raise Exception('Storage not configured')

    media_id = body.get('id')

    with db_conn.cursor() as cur:
        cur.execute('SELECT s3_key FROM media WHERE id = %s', (media_id,))
        row = cur.fetchone()
        if row:
            s3_client.delete_object(Bucket=s3_bucket, Key=row[0])
            cur.execute('DELETE FROM media WHERE id = %s', (media_id,))
            return {'deleted': True}
        return {'deleted': False}
```

## 4. Install Dependencies and Deploy

```bash
cd functions/api
pip install -r requirements.txt -t .
cd ../..
openkbs deploy
```

**Note:** Install dependencies directly into the function folder with `-t .` flag.

## 5. Test

```bash
# Status
curl -X POST https://<your-domain>/api

# Create item
curl -X POST https://<your-domain>/api \
  -H "Content-Type: application/json" \
  -d '{"action":"create","name":"Test","description":"Python test"}'

# List items
curl -X POST https://<your-domain>/api \
  -H "Content-Type: application/json" \
  -d '{"action":"list"}'

# Upload media (base64 encoded)
curl -X POST https://<your-domain>/api \
  -H "Content-Type: application/json" \
  -d '{"action":"upload","filename":"test.txt","contentType":"text/plain","data":"SGVsbG8gV29ybGQ="}'

# List media
curl -X POST https://<your-domain>/api \
  -H "Content-Type: application/json" \
  -d '{"action":"list-media"}'
```

## API Endpoints

| Action | Request | Response |
|--------|---------|----------|
| Status | `{}` | `{status, python, db, storage}` |
| List items | `{"action":"list"}` | `[{id, name, description}]` |
| Create item | `{"action":"create","name":"..."}` | `{id, name, ...}` |
| Delete item | `{"action":"delete","id":1}` | `{deleted: true}` |
| Upload | `{"action":"upload","filename":"...","data":"base64..."}` | `{id, url, ...}` |
| List media | `{"action":"list-media"}` | `[{id, filename, url}]` |
| Delete media | `{"action":"delete-media","id":1}` | `{deleted: true}` |

## Key Points

1. **Global Initialization** - Database and S3 connections are created outside the handler for reuse.

2. **URL Parsing** - `DATABASE_URL` needs to be parsed with `urlparse`.

3. **Dependencies** - Install with `pip install -t .` to include in deployment.

4. **Base64 Files** - For small files, encode as base64 in request body.

5. **CloudFront URLs** - Return `/{s3_key}` for CloudFront-served files.

## Full Example

See the complete project at [github.com/open-kbs/tutorials/examples/python-demo](https://github.com/open-kbs/tutorials/tree/main/examples/python-demo).

## Next Steps

You now have everything to build full-stack apps with OpenKBS Elastic services!
