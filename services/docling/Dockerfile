# syntax=docker/dockerfile:1
FROM node:22-trixie
WORKDIR /service
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates libgomp1 \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
# PDFium and model files are baked only into this image.
RUN curl -fsSL https://raw.githubusercontent.com/docling-project/docling.rs/v1.41.0/scripts/install/download_dependencies.sh \
  | sh -s -- --no-asr --no-chunk
COPY server.mjs ./
ENV NODE_ENV=production DOCLING_RS_HOME=/service PDFIUM_DYNAMIC_LIB_PATH=/service/.pdfium/lib
ENV LD_LIBRARY_PATH=/service/.pdfium/lib:/service/node_modules/docling.rs:/service/node_modules/docling.rs-linux-x64-gnu
ENV PORT=8090
EXPOSE 8090
USER node
CMD ["node", "server.mjs"]
