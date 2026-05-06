import { createApp } from "./app.js";
import { config } from "./config.js";
import { hydrateStoreFromDatabase, initDatabase } from "./db.js";
import { seedDemoUsers, store } from "./store.js";

await initDatabase();
await hydrateStoreFromDatabase(store);
await seedDemoUsers();

const app = createApp();

app.listen(config.port, () => {
  console.log(`TOEIC2Skills backend listening on http://127.0.0.1:${config.port}`);
  console.log("Demo users: learner@example.com / Password1, admin@example.com / Admin1234");
});
