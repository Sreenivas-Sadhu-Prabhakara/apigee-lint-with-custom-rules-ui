# Self-contained image for the custom apigeelint CLI (with bundled custom rules).
# Build context is the repo root; only the cli/ fork is copied in.
#
#   docker build -t apigeelint-custom .
#   docker run --rm -v "$PWD:/work" apigeelint-custom -s /work/apiproxy -f table.js
#
FROM node:20-bookworm-slim AS build
WORKDIR /opt/apigeelint

# Install production dependencies first (better layer caching).
COPY cli/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund

# Copy the CLI source, including externalPlugins/ (the bundled custom rules).
COPY cli/ ./

# --- runtime image --------------------------------------------------------
FROM node:20-bookworm-slim
WORKDIR /work
ENV NODE_ENV=production
COPY --from=build /opt/apigeelint /opt/apigeelint

# The CLI is the entrypoint; pass apigeelint args to `docker run`.
ENTRYPOINT ["node", "/opt/apigeelint/cli.js"]
CMD ["--help"]
