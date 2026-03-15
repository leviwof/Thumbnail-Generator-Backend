const mongoose = require("mongoose");

const app = require("./app");
const env = require("./config/env");
const Thumbnail = require("./models/Thumbnail");
const Video = require("./models/Video");

function redactMongoUri(uri) {
  return uri.replace(/\/\/([^:]+):([^@]+)@/, "//$1:<redacted>@");
}

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

async function startServer() {
  mongoose.connection.on("connected", async () => {
    const resolvedDatabaseName = resolveDatabaseName(env.mongoUri, mongoose.connection.name);

    console.log("MongoDB connected");
    // console.log("MongoDB URI:", redactMongoUri(env.mongoUri));
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
  console.error("Failed to start server", error);
  process.exit(1);
});
