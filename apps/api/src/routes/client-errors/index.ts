import type { FastifyInstance } from "fastify";

interface ErrorEvent {
  message: string;
  stack?: string;
  context?: string;
  url?: string;
  appVersion?: string;
}

interface ClientErrorBody {
  events: ErrorEvent[];
}

export async function clientErrorRoutes(fastify: FastifyInstance): Promise<void> {
  // Unauthenticated endpoint — strict IP rate limit to prevent log flooding.
  fastify.post<{ Body: ClientErrorBody }>(
    "/",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const body = request.body as Partial<ClientErrorBody>;

      if (!body || !Array.isArray(body.events) || body.events.length === 0) {
        return reply.code(204).send();
      }

      // Process up to 10 events per request to limit log volume.
      const events = body.events.slice(0, 10);

      for (const event of events) {
        if (typeof event.message !== "string") continue;

        request.log.warn(
          {
            clientError: true,
            message: event.message,
            context: typeof event.context === "string" ? event.context : undefined,
            appVersion: typeof event.appVersion === "string" ? event.appVersion : undefined,
            url: typeof event.url === "string" ? event.url : undefined,
            stack: typeof event.stack === "string" ? event.stack : undefined,
          },
          "client-error",
        );
      }

      return reply.code(204).send();
    },
  );
}
