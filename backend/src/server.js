import { createApp } from "./app.js";
import { config } from "./config.js";
import { seedDemoUsers } from "./store.js";

await seedDemoUsers();

const app = createApp();

app.listen(config.port, () => {
  console.log(`TOEIC2Skills backend listening on http://127.0.0.1:${config.port}`);
  console.log("Demo users: learner@example.com / Password1, admin@example.com / Admin1234");
});
