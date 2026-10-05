import { app } from './app';
import { assertConfig, config } from './config';

assertConfig();

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});