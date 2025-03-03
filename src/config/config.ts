import * as dotenv from "dotenv";

dotenv.config();

export default {
  port: parseInt(process.env.PORT) || 3020,
};
