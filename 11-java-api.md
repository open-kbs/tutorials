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
4. Your app will be live at `https://myapp.click`

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
    <version>1.0-SNAPSHOT</version>
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
            <groupId>com.google.code.gson</groupId>
            <artifactId>gson</artifactId>
            <version>2.10.1</version>
        </dependency>
        <dependency>
            <groupId>org.postgresql</groupId>
            <artifactId>postgresql</artifactId>
            <version>42.7.4</version>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-shade-plugin</artifactId>
                <version>3.5.0</version>
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
                // Parse postgres://user:pass@host/db?params
                Pattern p = Pattern.compile("postgres(?:ql)?://([^:]+):([^@]+)@([^/]+)/([^?]+)(?:\\?(.*))?");
                Matcher m = p.matcher(dbUrl);

                if (m.matches()) {
                    String user = m.group(1);
                    String pass = m.group(2);
                    String host = m.group(3);
                    String database = m.group(4);
                    String params = m.group(5);

                    StringBuilder jdbc = new StringBuilder();
                    jdbc.append("jdbc:postgresql://").append(host).append("/").append(database);
                    jdbc.append("?user=").append(user);
                    jdbc.append("&password=").append(pass);

                    if (params != null) {
                        for (String param : params.split("&")) {
                            if (!param.startsWith("channel_binding=")) {
                                jdbc.append("&").append(param);
                            }
                        }
                    }

                    dbConnection = DriverManager.getConnection(jdbc.toString());

                    // Create table
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
                }
            }
        } catch (Exception e) {
            dbError = e.getMessage();
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
        if (dbConnection == null) throw new SQLException("Database not connected");

        List<Map<String, Object>> items = new ArrayList<>();

        try (Statement stmt = dbConnection.createStatement();
             ResultSet rs = stmt.executeQuery("SELECT * FROM items ORDER BY created_at DESC LIMIT 50")) {
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
        if (dbConnection == null) throw new SQLException("Database not connected");

        String name = req.get("name").getAsString();
        String desc = req.has("description") ? req.get("description").getAsString() : "";

        try (PreparedStatement stmt = dbConnection.prepareStatement(
                "INSERT INTO items (name, description) VALUES (?, ?) RETURNING id, created_at")) {
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
        if (dbConnection == null) throw new SQLException("Database not connected");

        int id = req.get("id").getAsInt();

        try (PreparedStatement stmt = dbConnection.prepareStatement("DELETE FROM items WHERE id = ?")) {
            stmt.setInt(1, id);
            return Map.of("deleted", stmt.executeUpdate() > 0);
        }
    }
}
```

## 4. Build and Deploy

```bash
cd functions/api
mvn package
cd ../..
openkbs deploy
```

## 5. Test

```bash
# Status
curl -X POST https://your-kb.openkbs.com/api

# Create item
curl -X POST https://your-kb.openkbs.com/api \
  -H "Content-Type: application/json" \
  -d '{"action":"create","name":"Test Item","description":"A test"}'

# List items
curl -X POST https://your-kb.openkbs.com/api \
  -H "Content-Type: application/json" \
  -d '{"action":"list"}'

# Delete item
curl -X POST https://your-kb.openkbs.com/api \
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
