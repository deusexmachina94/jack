import { buildContainer } from './container.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

async function main(): Promise<void> {
  const { app, close } = await buildContainer();
  const shutdown = async (): Promise<void> => { await app.close(); await close(); };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  try {
    await app.listen({ port: PORT, host: HOST });
  } catch (err) {
    app.log.error(err);
    await close();
    process.exit(1);
  }
}

void main();
