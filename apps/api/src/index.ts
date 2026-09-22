import { createApp } from "./app.js";
import { getConfig } from "./config.js";

const config = getConfig();
const { app } = createApp(config);

app.listen(config.port, "127.0.0.1", () => {
  console.log(`Auvra API listening at http://127.0.0.1:${config.port}`);
  console.log(`Orbio configuration: ${config.provider.apiKey ? "ready" : "missing ORBIO_API_KEY"}; model ${config.provider.model}`);
});
