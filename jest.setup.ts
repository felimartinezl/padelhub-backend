import dotenv from "dotenv";
dotenv.config({ path: ".env.test" });

// Redirige @/lib/prisma al mock compartido
jest.mock("@/lib/prisma", () => require("./__mocks__/prisma"));
