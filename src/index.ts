import { config } from "dotenv";
config();

console.log(process.env);

import Express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { installMcpRouter } from "./mcp/mcp.js";

const app = Express();
const PORT = process.env.PORT || 4189;

app.use(bodyParser.json());
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));

installMcpRouter(app);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
