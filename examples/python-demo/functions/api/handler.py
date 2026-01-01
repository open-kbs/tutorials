import json
import os
import base64
import uuid
import psycopg2
import boto3
from urllib.parse import urlparse

# Parse DATABASE_URL and connect
db_conn = None
db_error = None
s3_client = None
s3_bucket = os.environ.get('STORAGE_BUCKET')

try:
    db_url = os.environ.get('DATABASE_URL')
    if db_url:
        parsed = urlparse(db_url)
        db_conn = psycopg2.connect(
            host=parsed.hostname,
            port=parsed.port or 5432,
            database=parsed.path[1:],
            user=parsed.username,
            password=parsed.password,
            sslmode='require'
        )
        db_conn.autocommit = True

        with db_conn.cursor() as cur:
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
except Exception as e:
    db_error = str(e)

# Initialize S3 client
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

    with db_conn.cursor() as cur:
        cur.execute('SELECT id, name, description, created_at FROM items ORDER BY created_at DESC LIMIT 50')
        rows = cur.fetchall()
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

    with db_conn.cursor() as cur:
        cur.execute(
            'INSERT INTO items (name, description) VALUES (%s, %s) RETURNING id, created_at',
            (name, description)
        )
        row = cur.fetchone()
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

    with db_conn.cursor() as cur:
        cur.execute('DELETE FROM items WHERE id = %s', (item_id,))
        return {'deleted': cur.rowcount > 0}


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

    # Generate presigned URL for access
    url = s3_client.generate_presigned_url(
        'get_object',
        Params={'Bucket': s3_bucket, 'Key': s3_key},
        ExpiresIn=86400
    )

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
        result = []
        for row in rows:
            url = s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': s3_bucket, 'Key': row[2]},
                ExpiresIn=86400
            ) if s3_client else f"/{row[2]}"
            result.append({
                'id': row[0],
                'filename': row[1],
                's3Key': row[2],
                'url': url,
                'contentType': row[3],
                'sizeBytes': row[4],
                'createdAt': str(row[5])
            })
        return result


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
