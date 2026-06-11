import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { username } from "better-auth/plugins";
import { db } from "./db";
import { env } from "./env";
import { redis, redisKey, NS } from "./redis";

export const auth = betterAuth({
  database: prismaAdapter(db, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    username()
  ],
  secondaryStorage: {
    get: async (key) => {
      const val = await redis.get(redisKey(NS.session, key));
      return val ? val : null;
    },
    set: async (key, value, ttl) => {
      const k = redisKey(NS.session, key);
      if (ttl) {
        await redis.set(k, value, "EX", ttl);
      } else {
        await redis.set(k, value);
      }
    },
    delete: async (key) => {
      await redis.del(redisKey(NS.session, key));
    }
  },
  rateLimit: {
    storage: "secondary-storage",
    customRules: {
      "/sign-in/email": {
        window: 60,
        max: 5,
      },
      "/sign-up/email": {
        window: 60,
        max: 5,
      }
    }
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    }
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "VIEWER",
      }
    }
  },
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
});
