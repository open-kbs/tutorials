# Tutorial 10: Node.js Full-Stack App

Build a complete social app with posts, real-time updates, private chat, image uploads, and presence tracking.

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
4. Your app will be live at `https://myapp.click`

### 4. Install CLI and Get kbId

```bash
npm install -g openkbs
openkbs login
openkbs ls
```

Note your `kbId` - you'll need it for the frontend.

---

## What We're Building

- **Posts Feed** - Create posts with optional images
- **Real-time Updates** - New posts appear instantly
- **Private Chat** - Direct messages between users
- **Presence** - See who's online
- **Image Uploads** - Upload images to S3 with CloudFront CDN

## Project Structure

```
nodejs-demo/
├── openkbs.json
├── functions/
│   ├── auth/
│   │   ├── index.mjs
│   │   └── package.json
│   └── posts/
│       ├── index.mjs
│       └── package.json
└── site/
    └── index.html
```

## 1. Configuration

`openkbs.json`:
```json
{
  "name": "nodejs-demo",
  "region": "us-east-1",

  "elastic": {
    "pulse": true,
    "postgres": true,
    "storage": {
      "cloudfront": "media"
    }
  },

  "functions": ["auth", "posts"],

  "site": "./site"
}
```

## 2. Auth Function

Handles registration, login, and Pulse token generation.

`functions/auth/index.mjs`:
```javascript
import pg from 'pg';
import crypto from 'crypto';

const { Client } = pg;
const db = new Client({ connectionString: process.env.DATABASE_URL });
let dbConnected = false;

async function connectDB() {
    if (!dbConnected) {
        await db.connect();
        dbConnected = true;

        await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                private_channel VARCHAR(64) UNIQUE NOT NULL,
                avatar_color VARCHAR(7) DEFAULT '#007bff',
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
    }
}

// Generate secure private channel for DMs
function generatePrivateChannel() {
    return crypto.randomBytes(32).toString('hex');
}

// Get Pulse token for WebSocket auth
async function getPulseToken(userId) {
    const kbId = process.env.OPENKBS_KB_ID;
    const apiKey = process.env.OPENKBS_API_KEY;

    if (!kbId || !apiKey) return null;

    const response = await fetch('https://kb.openkbs.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'createPulseToken',
            kbId, apiKey,
            userId: String(userId)
        })
    });

    const data = await response.json();
    return data.error ? null : data;
}

export async function handler(event) {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (event.requestContext?.http?.method === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        await connectDB();
        const body = JSON.parse(event.body || '{}');
        const { action, email, password, name } = body;

        if (action === 'register') {
            const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
            if (existing.rows.length > 0) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email exists' }) };
            }

            const privateChannel = generatePrivateChannel();
            const colors = ['#e91e63', '#9c27b0', '#3f51b5', '#2196f3', '#4caf50', '#ff9800'];
            const avatarColor = colors[Math.floor(Math.random() * colors.length)];

            const result = await db.query(
                'INSERT INTO users (name, email, password, private_channel, avatar_color) VALUES ($1, $2, $3, $4, $5) RETURNING *',
                [name, email, password, privateChannel, avatarColor]
            );

            const user = result.rows[0];
            const pulseData = await getPulseToken(user.id);

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        avatarColor: user.avatar_color,
                        privateChannel: user.private_channel,
                        pulseToken: pulseData?.token,
                        pulseEndpoint: pulseData?.endpoint
                    }
                })
            };
        }

        if (action === 'login') {
            const result = await db.query(
                'SELECT * FROM users WHERE email = $1 AND password = $2',
                [email, password]
            );

            if (result.rows.length === 0) {
                return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid credentials' }) };
            }

            const user = result.rows[0];
            const pulseData = await getPulseToken(user.id);

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        avatarColor: user.avatar_color,
                        privateChannel: user.private_channel,
                        pulseToken: pulseData?.token,
                        pulseEndpoint: pulseData?.endpoint
                    }
                })
            };
        }

        if (action === 'users') {
            const result = await db.query('SELECT id, name, avatar_color FROM users ORDER BY name');
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    users: result.rows.map(u => ({
                        id: u.id,
                        name: u.name,
                        avatarColor: u.avatar_color
                    }))
                })
            };
        }

        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid action' }) };
    } catch (error) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
}
```

`functions/auth/package.json`:
```json
{
  "type": "module",
  "dependencies": {
    "pg": "^8.11.3"
  }
}
```

## 3. Posts Function

Handles posts, messages, and image uploads.

`functions/posts/index.mjs`:
```javascript
import pg from 'pg';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import pulse from 'openkbs-pulse/server';

const { Client } = pg;
const db = new Client({ connectionString: process.env.DATABASE_URL });
const s3 = new S3Client({ region: process.env.STORAGE_REGION || 'us-east-1' });
let dbConnected = false;

async function connectDB() {
    if (!dbConnected) {
        await db.connect();
        dbConnected = true;

        await db.query(`
            CREATE TABLE IF NOT EXISTS posts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                user_name VARCHAR(255) NOT NULL,
                content TEXT,
                image_url TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                from_user_id INTEGER NOT NULL,
                from_user_name VARCHAR(255) NOT NULL,
                to_user_id INTEGER NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
    }
}

export async function handler(event) {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (event.requestContext?.http?.method === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const { action } = body;

        // Upload URL (no DB needed)
        if (action === 'getUploadUrl') {
            const bucket = process.env.STORAGE_BUCKET;
            if (!bucket) {
                return { statusCode: 500, headers, body: JSON.stringify({ error: 'Storage not configured' }) };
            }

            // Key must match CloudFront path
            const timestamp = Date.now();
            const safeName = (body.fileName || 'image.jpg').replace(/[^a-zA-Z0-9.-]/g, '_');
            const key = `media/uploads/${timestamp}-${safeName}`;

            const command = new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                ContentType: body.contentType || 'image/jpeg'
            });

            const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
            const publicUrl = `/${key}`;

            return { statusCode: 200, headers, body: JSON.stringify({ uploadUrl, publicUrl, key }) };
        }

        await connectDB();
        const kbId = process.env.OPENKBS_KB_ID;
        const apiKey = process.env.OPENKBS_API_KEY;

        if (action === 'list') {
            const result = await db.query(
                'SELECT * FROM posts ORDER BY created_at DESC LIMIT 50'
            );

            const posts = result.rows.map(row => ({
                id: row.id,
                userId: row.user_id,
                userName: row.user_name,
                content: row.content,
                imageUrl: row.image_url,
                createdAt: row.created_at
            }));

            return { statusCode: 200, headers, body: JSON.stringify({ posts }) };
        }

        if (action === 'create') {
            const { content, imageUrl, userId, userName } = body;

            if (!content && !imageUrl) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Content or image required' }) };
            }

            const result = await db.query(
                'INSERT INTO posts (user_id, user_name, content, image_url) VALUES ($1, $2, $3, $4) RETURNING id, created_at',
                [userId, userName, content || '', imageUrl || null]
            );

            const post = {
                id: result.rows[0].id,
                userId, userName,
                content: content || '',
                imageUrl: imageUrl || null,
                createdAt: result.rows[0].created_at
            };

            // Broadcast to all subscribers
            await pulse.publish('posts', 'new_post', { post }, { kbId, apiKey });

            return { statusCode: 200, headers, body: JSON.stringify({ post }) };
        }

        if (action === 'sendMessage') {
            const { toUserId, message, fromUserId, fromUserName } = body;

            // Get recipient's private channel
            const recipientResult = await db.query(
                'SELECT private_channel FROM users WHERE id = $1',
                [toUserId]
            );

            if (recipientResult.rows.length === 0) {
                return { statusCode: 404, headers, body: JSON.stringify({ error: 'Recipient not found' }) };
            }

            const recipientChannel = recipientResult.rows[0].private_channel;

            // Store message
            const msgResult = await db.query(
                'INSERT INTO messages (from_user_id, from_user_name, to_user_id, content) VALUES ($1, $2, $3, $4) RETURNING id, created_at',
                [fromUserId, fromUserName, toUserId, message]
            );

            const msgData = {
                id: msgResult.rows[0].id,
                fromUserId, fromUserName, toUserId,
                content: message,
                createdAt: msgResult.rows[0].created_at
            };

            // Publish to recipient's SECRET channel
            await pulse.publish(recipientChannel, 'new_message', msgData, { kbId, apiKey });

            return { statusCode: 200, headers, body: JSON.stringify({ message: msgData }) };
        }

        if (action === 'getMessages') {
            const { userId, withUserId } = body;

            const result = await db.query(
                `SELECT * FROM messages
                 WHERE (from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1)
                 ORDER BY created_at ASC LIMIT 100`,
                [userId, withUserId]
            );

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    messages: result.rows.map(m => ({
                        id: m.id,
                        fromUserId: m.from_user_id,
                        fromUserName: m.from_user_name,
                        toUserId: m.to_user_id,
                        content: m.content,
                        createdAt: m.created_at
                    }))
                })
            };
        }

        if (action === 'presence') {
            const result = await pulse.presence(body.channel || 'posts', { kbId, apiKey });
            return { statusCode: 200, headers, body: JSON.stringify({ count: result.count || 0 }) };
        }

        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid action' }) };
    } catch (error) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
}
```

`functions/posts/package.json`:
```json
{
  "type": "module",
  "dependencies": {
    "pg": "^8.11.3",
    "@aws-sdk/client-s3": "^3.400.0",
    "@aws-sdk/s3-request-presigner": "^3.400.0",
    "openkbs-pulse": "^2.0.1"
  }
}
```

## 4. Deploy

```bash
# Install dependencies
cd functions/auth && npm install && cd ../..
cd functions/posts && npm install && cd ../..

# Deploy
openkbs deploy
```

## 5. Frontend Usage

```html
<script src="https://unpkg.com/openkbs-pulse@2.0.1/pulse.js"></script>
<script>
// After login, connect to Pulse
const realtime = new Pulse.Realtime({
    kbId: 'YOUR_KB_ID',
    token: user.pulseToken,
    endpoint: user.pulseEndpoint,
    clientId: String(user.id)
});

// Posts channel
const postsChannel = realtime.channels.get('posts');

// Real-time new posts
postsChannel.subscribe('new_post', (msg) => {
    console.log('New post:', msg.data.post);
});

// Presence
postsChannel.presence.enter({ userId: user.id, name: user.name });
postsChannel.presence.subscribe((members) => {
    console.log('Online:', members.length);
});

// Private messages - subscribe to your secret channel
const privateChannel = realtime.channels.get(user.privateChannel);
privateChannel.subscribe('new_message', (msg) => {
    console.log('Private message:', msg.data);
});
</script>
```

## Key Concepts

### Private Channels

Each user has a unique `private_channel` (64-char hex). Only they know this channel ID:

1. User subscribes to their own `private_channel`
2. Sender calls API with recipient's user ID
3. Backend looks up recipient's `private_channel` from DB
4. Backend publishes to that secret channel
5. Only recipient receives the message

### Image Upload Flow

1. Frontend requests presigned URL
2. Backend returns S3 upload URL + public CloudFront URL
3. Frontend uploads directly to S3
4. Frontend creates post with the public URL

## Full Example

See the complete project at [github.com/open-kbs/tutorials/examples/nodejs-demo](https://github.com/open-kbs/tutorials/tree/main/examples/nodejs-demo).

## Next Steps

- [Tutorial 11: Java REST API](/tutorials/java-api/)
- [Tutorial 12: Python API](/tutorials/python-api/)
