import { asc, eq } from "drizzle-orm";
import { db } from "./postgres.js";
import { user } from "./schema.js";

export const initPostgres = async () => {
  try {
    // Find the oldest user by createdAt timestamp
    const oldestUser = await db.select().from(user).orderBy(asc(user.createdAt)).limit(1);

    if (oldestUser.length > 0) {
      // Update the oldest user's role to admin
      await db.update(user).set({ role: "admin" }).where(eq(user.id, oldestUser[0].id));
    }
  } catch (error) {
    console.error("Error initializing postgres:", error);
  }
};
