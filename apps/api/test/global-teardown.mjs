export default async function globalTeardown() {
  if (globalThis.__PG__) await globalThis.__PG__.stop();
}
