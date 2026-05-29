import process from "node:process";

import { createApp } from "./app.js";

const port = Number(process.env.PORT || 3001);
const app = createApp();

app.listen(port, () => {
  console.log(`Line halftone API listening on http://localhost:${port}`);
});
