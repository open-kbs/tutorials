# Tutorial 11: Java REST API

Build a CRUD API with Java 25 and PostgreSQL.

## What is OpenKBS Elastic?

**OpenKBS Elastic** lets you deploy full-stack applications with zero infrastructure setup. Instead of configuring AWS, databases, and CDNs manually, you get production-ready services with simple CLI commands.

| Service | What You Get | Used In This Tutorial |
|---------|--------------|----------------------|
| **Postgres** | PostgreSQL database (Neon) | Store items |
| **Functions** | Serverless Lambda APIs | Java endpoint |

```bash
openkbs postgres enable    # Database ready in 10 seconds
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

### 4. Install CLI

```bash
npm install -g openkbs
openkbs login
```

---

## Project Structure

```
java-demo/
├── openkbs.json
├── functions/
│   ├── settings.json
│   └── api/
│       ├── pom.xml
│       └── src/main/java/com/example/Handler.java
└── site/
    └── index.html
```

## 1. Configuration

`openkbs.json`:
```json
{
  "name": "java-demo",
  "region": "us-east-1",

  "elastic": {
    "postgres": true
  },

  "functions": [
    {
      "name": "api",
      "runtime": "java25",
      "handler": "com.example.Handler::handleRequest",
      "memory": 512,
      "timeout": 30
    }
  ],

  "site": "./site"
}
```

`functions/settings.json` (get your KB ID from Platform Setup):
```json
{
  "kbId": "your-kb-id",
  "region": "us-east-1"
}
```

## 2. Maven Configuration

`functions/api/pom.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.example</groupId>
    <artifactId>api</artifactId>
    <version>1.0</version>
    <packaging>jar</packaging>

    <properties>
        <maven.compiler.source>25</maven.compiler.source>
        <maven.compiler.target>25</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>

    <dependencies>
        <dependency>
            <groupId>com.amazonaws</groupId>
            <artifactId>aws-lambda-java-core</artifactId>
            <version>1.2.3</version>
        </dependency>
        <dependency>
            <groupId>org.postgresql</groupId>
            <artifactId>postgresql</artifactId>
            <version>42.7.4</version>
        </dependency>
        <dependency>
            <groupId>com.google.code.gson</groupId>
            <artifactId>gson</artifactId>
            <version>2.11.0</version>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-shade-plugin</artifactId>
                <version>3.5.1</version>
                <executions>
                    <execution>
                        <phase>package</phase>
                        <goals><goal>shade</goal></goals>
                    </execution>
                </executions>
            </plugin>
        </plugins>
    </build>
</project>
```

## 3. Handler

`functions/api/src/main/java/com/example/Handler.java`:
```java
package com.example;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.google.gson.Gson;
import com.google.gson.JsonObject;

import java.sql.*;
import java.util.*;
import java.util.regex.*;

public class Handler implements RequestHandler<Map<String, Object>, Map<String, Object>> {

    private static final Gson gson = new Gson();
    private static Connection dbConnection;
    private static String dbError = null;

    static {
        try {
            Class.forName("org.postgresql.Driver");

            String dbUrl = System.getenv("DATABASE_URL");
            if (dbUrl != null) {
                // Parse postgres://user:pass@host/db?params format
                // Convert to jdbc:postgresql://host/db?user=X&password=Y&params
                Pattern p = Pattern.compile("postgres(?:ql)?://([^:]+):([^@]+)@([^/]+)/([^?]+)(?:\\?(.*))?");
                Matcher m = p.matcher(dbUrl);

                if (m.matches()) {
                    String user = m.group(1);
                    String pass = m.group(2);
                    String host = m.group(3);
                    String database = m.group(4);
                    String params = m.group(5);

                    // Build JDBC URL
                    StringBuilder jdbc = new StringBuilder();
                    jdbc.append("jdbc:postgresql://").append(host).append("/").append(database);
                    jdbc.append("?user=").append(user);
                    jdbc.append("&password=").append(pass);

                    // Add other params (skip channel_binding - not supported by JDBC)
                    if (params != null) {
                        for (String param : params.split("&")) {
                            if (!param.startsWith("channel_binding=")) {
                                jdbc.append("&").append(param);
                            }
                        }
                    }

                    dbConnection = DriverManager.getConnection(jdbc.toString());

                    // Create table on first connect
                    try (Statement stmt = dbConnection.createStatement()) {
                        stmt.execute("""
                            CREATE TABLE IF NOT EXISTS items (
                                id SERIAL PRIMARY KEY,
                                name VARCHAR(255) NOT NULL,
                                description TEXT,
                                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                            )
                        """);
                    }
                } else {
                    dbError = "Invalid DATABASE_URL format";
                }
            }
        } catch (Exception e) {
            dbError = e.getClass().getSimpleName() + ": " + e.getMessage();
        }
    }

    @Override
    public Map<String, Object> handleRequest(Map<String, Object> event, Context context) {
        Map<String, Object> response = new HashMap<>();
        Map<String, String> headers = new HashMap<>();
        headers.put("Content-Type", "application/json");
        headers.put("Access-Control-Allow-Origin", "*");
        response.put("headers", headers);

        try {
            String body = (String) event.get("body");
            JsonObject req = body != null ? gson.fromJson(body, JsonObject.class) : new JsonObject();
            String action = req.has("action") ? req.get("action").getAsString() : "status";

            Object result = switch (action) {
                case "list" -> listItems();
                case "create" -> createItem(req);
                case "delete" -> deleteItem(req);
                default -> Map.of(
                    "status", "ok",
                    "java", "25",
                    "db", dbConnection != null,
                    "dbError", dbError != null ? dbError : ""
                );
            };

            response.put("statusCode", 200);
            response.put("body", gson.toJson(result));

        } catch (Exception e) {
            response.put("statusCode", 500);
            response.put("body", gson.toJson(Map.of("error", e.getMessage())));
        }

        return response;
    }

    private List<Map<String, Object>> listItems() throws SQLException {
        if (dbConnection == null) {
            throw new SQLException("Database not connected: " + dbError);
        }

        List<Map<String, Object>> items = new ArrayList<>();
        String sql = "SELECT * FROM items ORDER BY created_at DESC LIMIT 50";

        try (Statement stmt = dbConnection.createStatement();
             ResultSet rs = stmt.executeQuery(sql)) {
            while (rs.next()) {
                items.add(Map.of(
                    "id", rs.getInt("id"),
                    "name", rs.getString("name"),
                    "description", rs.getString("description") != null ? rs.getString("description") : "",
                    "createdAt", rs.getTimestamp("created_at").toString()
                ));
            }
        }
        return items;
    }

    private Map<String, Object> createItem(JsonObject req) throws SQLException {
        if (dbConnection == null) {
            throw new SQLException("Database not connected: " + dbError);
        }

        String name = req.get("name").getAsString();
        String desc = req.has("description") ? req.get("description").getAsString() : "";
        String sql = "INSERT INTO items (name, description) VALUES (?, ?) RETURNING id, created_at";

        try (PreparedStatement stmt = dbConnection.prepareStatement(sql)) {
            stmt.setString(1, name);
            stmt.setString(2, desc);
            ResultSet rs = stmt.executeQuery();
            rs.next();
            return Map.of(
                "id", rs.getInt("id"),
                "name", name,
                "description", desc,
                "createdAt", rs.getTimestamp("created_at").toString()
            );
        }
    }

    private Map<String, Object> deleteItem(JsonObject req) throws SQLException {
        if (dbConnection == null) {
            throw new SQLException("Database not connected: " + dbError);
        }

        int id = req.get("id").getAsInt();
        String sql = "DELETE FROM items WHERE id = ?";

        try (PreparedStatement stmt = dbConnection.prepareStatement(sql)) {
            stmt.setInt(1, id);
            return Map.of("deleted", stmt.executeUpdate() > 0);
        }
    }
}
```

## 4. Frontend

`site/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Java 25 + PostgreSQL Demo</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: system-ui; background: #f0f2f5; min-height: 100vh; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }

        header { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 25px; border-radius: 12px; margin-bottom: 20px; }
        header h1 { font-size: 26px; margin-bottom: 8px; }
        .badges { display: flex; gap: 8px; flex-wrap: wrap; }
        .badge { background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 20px; font-size: 13px; }
        .badge.ok { background: rgba(72,187,120,0.3); }
        .badge.error { background: rgba(245,101,101,0.3); }

        .card { background: white; border-radius: 12px; padding: 20px; margin-bottom: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
        .card h2 { font-size: 18px; margin-bottom: 15px; color: #333; }

        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 6px; font-weight: 500; color: #555; font-size: 14px; }
        input, textarea { width: 100%; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; }
        textarea { resize: vertical; min-height: 80px; }
        input:focus, textarea:focus { outline: none; border-color: #667eea; box-shadow: 0 0 0 3px rgba(102,126,234,0.1); }

        button { background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500; }
        button:hover { opacity: 0.9; }
        button:disabled { opacity: 0.5; cursor: not-allowed; }

        .items { display: flex; flex-direction: column; gap: 12px; }
        .item { display: flex; justify-content: space-between; align-items: flex-start; padding: 16px; background: #f8fafc; border-radius: 10px; }
        .item-content { flex: 1; }
        .item-name { font-weight: 600; color: #1a202c; margin-bottom: 4px; }
        .item-desc { color: #718096; font-size: 14px; margin-bottom: 6px; }
        .item-date { font-size: 12px; color: #a0aec0; }
        .item-delete { background: #fed7d7; color: #c53030; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; }
        .item-delete:hover { background: #feb2b2; }

        .empty { text-align: center; color: #a0aec0; padding: 40px; }
        .loading { text-align: center; color: #718096; padding: 30px; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>Java 25 + PostgreSQL</h1>
            <div class="badges" id="status">
                <span class="badge">Checking...</span>
            </div>
        </header>

        <div class="card">
            <h2>Add Item</h2>
            <form id="addForm">
                <div class="form-group">
                    <label>Name</label>
                    <input type="text" id="itemName" required placeholder="Enter item name">
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea id="itemDesc" placeholder="Optional description"></textarea>
                </div>
                <button type="submit" id="submitBtn">Add Item</button>
            </form>
        </div>

        <div class="card">
            <h2>Items</h2>
            <div id="items" class="items">
                <div class="loading">Loading...</div>
            </div>
        </div>
    </div>

    <script>
        const API = '/api';

        async function checkStatus() {
            try {
                const res = await fetch(API, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'status' })
                });
                const data = await res.json();
                document.getElementById('status').innerHTML = `
                    <span class="badge ok">Java ${data.java}</span>
                    <span class="badge ${data.db ? 'ok' : 'error'}">PostgreSQL ${data.db ? '✓' : '✗'}</span>
                `;
            } catch (e) {
                document.getElementById('status').innerHTML = `<span class="badge error">Error</span>`;
            }
        }

        async function loadItems() {
            try {
                const res = await fetch(API, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'list' })
                });
                const items = await res.json();
                const container = document.getElementById('items');

                if (!items.length) {
                    container.innerHTML = '<div class="empty">No items yet</div>';
                    return;
                }

                container.innerHTML = items.map(item => `
                    <div class="item">
                        <div class="item-content">
                            <div class="item-name">${item.name}</div>
                            ${item.description ? `<div class="item-desc">${item.description}</div>` : ''}
                            <div class="item-date">${item.createdAt}</div>
                        </div>
                        <button class="item-delete" onclick="deleteItem(${item.id})">Delete</button>
                    </div>
                `).join('');
            } catch (e) {
                document.getElementById('items').innerHTML = '<div class="empty">Error loading</div>';
            }
        }

        async function deleteItem(id) {
            if (!confirm('Delete this item?')) return;
            await fetch(API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete', id })
            });
            loadItems();
        }

        document.getElementById('addForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('submitBtn');
            btn.disabled = true;

            try {
                await fetch(API, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'create',
                        name: document.getElementById('itemName').value,
                        description: document.getElementById('itemDesc').value
                    })
                });
                document.getElementById('addForm').reset();
                loadItems();
            } finally {
                btn.disabled = false;
            }
        });

        checkStatus();
        loadItems();
    </script>
</body>
</html>
```

## 5. Build and Deploy

```bash
cd functions/api
mvn clean package
unzip -o target/api-1.0.jar -d .
cd ../..
openkbs deploy
```

> **Note:** The shaded JAR must be extracted into the function folder. Lambda loads classes directly from the folder structure, not from a JAR file.

## 6. Test

Replace `<your-domain>` with your registered domain:

```bash
# Status
curl -X POST https://<your-domain>/api

# Create item
curl -X POST https://<your-domain>/api \
  -H "Content-Type: application/json" \
  -d '{"action":"create","name":"Test Item","description":"A test"}'

# List items
curl -X POST https://<your-domain>/api \
  -H "Content-Type: application/json" \
  -d '{"action":"list"}'

# Delete item
curl -X POST https://<your-domain>/api \
  -H "Content-Type: application/json" \
  -d '{"action":"delete","id":1}'
```

## Key Points

1. **Static Initialization** - Database connection is created once and reused across invocations.

2. **JDBC URL Conversion** - `DATABASE_URL` is in PostgreSQL format, needs conversion to JDBC format.

3. **Memory** - Java needs more memory. Set `"memory": 512` or higher.

4. **Shaded JAR** - Use maven-shade-plugin to create fat JAR with all dependencies.

## Full Example

See the complete project at [github.com/open-kbs/tutorials/examples/java-demo](https://github.com/open-kbs/tutorials/tree/main/examples/java-demo).

## Next Steps

- [Tutorial 12: Python API](/tutorials/python-api/)
