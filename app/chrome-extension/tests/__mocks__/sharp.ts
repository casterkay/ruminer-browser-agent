type SharpMockInstance = {
  metadata: () => Promise<{ channels?: number }>;
  rotate: () => SharpMockInstance;
  raw: () => SharpMockInstance;
  toBuffer: (opts?: { resolveWithObject?: boolean }) => Promise<
    | Buffer
    | {
        data: Buffer;
        info: { width: number; height: number; channels: number };
      }
  >;
};

function createSharpMockInstance(): SharpMockInstance {
  const instance: SharpMockInstance = {
    async metadata() {
      return {};
    },
    rotate() {
      return instance;
    },
    raw() {
      return instance;
    },
    async toBuffer(opts) {
      if (opts?.resolveWithObject) {
        return {
          data: Buffer.from([]),
          info: { width: 0, height: 0, channels: 4 },
        };
      }

      return Buffer.from([]);
    },
  };

  return instance;
}

export default function sharpMock(_input?: unknown): SharpMockInstance {
  return createSharpMockInstance();
}
