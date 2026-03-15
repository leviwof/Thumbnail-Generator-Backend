const mongoose = require("mongoose");

const app = require("./app");
const env = require("./config/env");
const Thumbnail = require("./models/Thumbnail");
const Video = require("./models/Video");

function resolveDatabaseName(uri, connectionName) {
  if (connectionName) {
    return connectionName;
  }

  try {
    const parsedUri = new URL(uri);
    const pathname = parsedUri.pathname.replace(/^\/+/, "");

    if (pathname) {
      return pathname;
    }
  } catch (_error) {
    return "";
  }

  return "";
}

function describeMongoTarget(uri) {
  try {
    const parsedUri = new URL(uri);
    return parsedUri.host || "<unknown host>";
  } catch (_error) {
    return "<invalid MongoDB URI>";
  }
}

async function startServer() {
  if (env.startupValidationErrors.length) {
    throw new Error(`Invalid startup configuration:\n- ${env.startupValidationErrors.join("\n- ")}`);
  }

  console.log("Connecting to MongoDB target:", describeMongoTarget(env.mongoUri));

  mongoose.connection.on("connected", async () => {
    const resolvedDatabaseName = resolveDatabaseName(env.mongoUri, mongoose.connection.name);

    console.log("MongoDB connected");
    console.log("MongoDB target:", describeMongoTarget(env.mongoUri));
    console.log("MongoDB database:", resolvedDatabaseName || "<none in URI>");

    if (!resolvedDatabaseName) {
      console.warn(
        "MongoDB URI does not include a database name. Atlas may store data in an unexpected default database."
      );
    }

    if (env.mongoUriUsesFallback) {
      console.warn(
        `MongoDB URI is using the local fallback because no MONGODB_URI or MONGO_URI was found in ${env.envFilePath}.`
      );
    }

    if (env.nodeEnv === "production" && env.clientUrlsUseFallback) {
      console.warn(
        "CLIENT_URL/CLIENT_URLS is not set, so CORS is still limited to http://localhost:5173."
      );
    }

    try {
      const collections = await mongoose.connection.db.listCollections().toArray();
      console.log(
        "Collections:",
        collections.length ? collections.map((collection) => collection.name) : []
      );
    } catch (error) {
      console.error("Unable to list MongoDB collections", error);
    }
  });

  mongoose.connection.on("error", (error) => {
    console.log("MongoDB error", error);
  });

  await mongoose.connect(env.mongoUri);
  await Promise.all([Video.syncIndexes(), Thumbnail.syncIndexes()]);

  app.listen(env.port, () => {
    console.log(`API running on port ${env.port}`);
  });
}

startServer().catch((error) => {
  if (error?.name === "MongooseServerSelectionError") {
    console.error(
      "MongoDB connection failed. On Render this usually means the MONGODB_URI is missing/incorrect, or MongoDB Atlas Network Access does not allow connections from Render."
    );
  }

  console.error("Failed to start server", error);
  process.exit(1);
});
