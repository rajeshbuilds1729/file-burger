/**
 * DataChannel abstraction.
 *
 * The transfer layer is written against `DataChannelLike` so it can be
 * exercised in Node (vitest integration tests use the in-memory pipe) while
 * the browser uses real RTCDataChannels.
 */

export interface DataChannelMessageEvent {
  data: string | ArrayBuffer;
}

export interface DataChannelLike {
  readonly readyState: "connecting" | "open" | "closing" | "closed";
  readonly bufferedAmount: number;
  bufferedAmountLowThreshold: number;
  binaryType: string;
  send(data: string | ArrayBuffer | Uint8Array): void;
  close(): void;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent<string | ArrayBuffer>) => void) | null;
  onclose: ((event: Event) => void) | null;
  onerror: ((event: RTCErrorEvent) => void) | null;
  onbufferedamountlow: ((event: Event) => void) | null;
}

/**
 * Wait until the channel's send buffer drains below the high-water mark.
 *
 * Uses the `bufferedamountlow` event when available with a polling fallback,
 * which is what gives us real backpressure: the sender stops reading from
 * the file while the network catches up.
 */
export function waitForChannelDrain(
  channel: DataChannelLike,
  highWaterMark: number,
  lowWaterMark: number,
  isAborted: () => boolean,
): Promise<void> {
  if (channel.bufferedAmount < highWaterMark) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearInterval(pollTimer);
      channel.onbufferedamountlow = null;
      resolve();
    };
    const check = () => {
      if (isAborted() || channel.readyState !== "open") {
        finish();
        return;
      }
      if (channel.bufferedAmount < highWaterMark) finish();
    };
    const pollTimer = setInterval(check, 25);
    channel.bufferedAmountLowThreshold = lowWaterMark;
    channel.onbufferedamountlow = () => {
      if (channel.bufferedAmount < highWaterMark) finish();
    };
  });
}

export interface ChannelPairOptions {
  /** Delivery delay in ms (simulates network latency). */
  latencyMs?: number;
}

export interface PipeChannel extends DataChannelLike {
  readyState: "connecting" | "open" | "closing" | "closed";
  /** Drop the channel without delivering queued data (simulates failure). */
  drop(): void;
  label: string;
}

/**
 * Create a pair of connected in-memory channels for tests and integration
 * checks. Sends from one side are delivered to the other asynchronously,
 * draining the sender's emulated buffer — so backpressure behavior can be
 * exercised deterministically.
 */
export function createChannelPair(options: ChannelPairOptions = {}): [PipeChannel, PipeChannel] {
  const latencyMs = options.latencyMs ?? 0;

  interface QueueItem {
    data: string | ArrayBuffer;
  }

  function createSide(label: string, other: {
    deliver: (data: string | ArrayBuffer) => void;
    notifyClose: () => void;
  }): PipeChannel {
    const queue: QueueItem[] = [];
    let buffered = 0;
    const channel: PipeChannel = {
      label,
      readyState: "connecting" as const,
      get bufferedAmount() {
        return buffered;
      },
      bufferedAmountLowThreshold: 0,
      binaryType: "arraybuffer",
      send(data) {
        if (channel.readyState !== "open") {
          throw new Error("channel_closed");
        }
        const payload: string | ArrayBuffer =
          typeof data === "string"
            ? data
            : data instanceof ArrayBuffer
              ? data
              : (data.buffer.slice(
                  data.byteOffset,
                  data.byteOffset + data.byteLength,
                ) as ArrayBuffer);
        const size = typeof payload === "string" ? payload.length : payload.byteLength;
        buffered += size;
        const item: QueueItem = { data: payload };
        queue.push(item);
        const deliverItem = (target: QueueItem) => {
          const index = queue.indexOf(target);
          if (index === -1) return;
          queue.splice(index, 1);
          buffered -=
            typeof target.data === "string" ? target.data.length : target.data.byteLength;
          other.deliver(target.data);
          if (buffered <= channel.bufferedAmountLowThreshold) {
            channel.onbufferedamountlow?.(new Event("bufferedamountlow"));
          }
        };
        setTimeout(() => deliverItem(item), latencyMs);
      },
      close() {
        if (channel.readyState === "closed") return;
        channel.readyState = "closed" as const;
        queue.length = 0;
        buffered = 0;
        other.notifyClose();
        channel.onclose?.(new Event("close"));
      },
      drop() {
        if (channel.readyState === "closed") return;
        channel.readyState = "closed" as const;
        queue.length = 0;
        buffered = 0;
        other.notifyClose();
        channel.onclose?.(new Event("close"));
      },
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
      onbufferedamountlow: null,
    };
    return channel;
  }

  const deliver = (
    target: PipeChannel,
    data: string | ArrayBuffer,
  ): void => {
    if (target.readyState !== "open") return;
    target.onmessage?.({ data } as MessageEvent<string | ArrayBuffer>);
  };

  const notifyClosed = (target: PipeChannel): void => {
    if (target.readyState === "closed") return;
    target.readyState = "closed";
    target.onclose?.(new Event("close"));
  };

  const a = createSide("a", {
    // Side A's outgoing data is delivered to side B.
    deliver: (data: string | ArrayBuffer) => deliver(b!, data),
    notifyClose: () => notifyClosed(b!),
  });
  const b = createSide("b", {
    // Side B's outgoing data is delivered to side A.
    deliver: (data: string | ArrayBuffer) => deliver(a!, data),
    notifyClose: () => notifyClosed(a!),
  });

  // Open both sides asynchronously.
  setTimeout(() => {
    a.readyState = "open";
    b.readyState = "open";
    a.onopen?.(new Event("open"));
    b.onopen?.(new Event("open"));
  }, latencyMs);

  return [a, b];
}
