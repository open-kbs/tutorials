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
