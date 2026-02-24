function resolveWsUrl() {
  const fromEnv = import.meta.env.VITE_AI_WS_URL;
  if (fromEnv) return fromEnv;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/stt`;
}

export class AiWsClient {
  constructor({ meetingId, onOpen, onClose, onError, onMessage }) {
    this.meetingId = meetingId;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.onError = onError;
    this.onMessage = onMessage;

    this.ws = null;
    this.manualClose = false;
    this.pendingJson = [];
    this.pendingBinary = [];
  }

  connect() {
    this.manualClose = false;
    this.ws = new WebSocket(resolveWsUrl());
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      this.sendJson({
        type: 'start',
        meetingId: String(this.meetingId),
      });

      this.flushQueues();
      this.onOpen?.();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.onMessage?.(data);
      } catch (error) {
        console.error('Failed to parse AI WS message', error);
      }
    };

    this.ws.onerror = (event) => {
      this.onError?.(event);
    };

    this.ws.onclose = () => {
      this.onClose?.();
    };
  }

  stopAndClose() {
    this.manualClose = true;
    this.sendJson({ type: 'stop' });
    setTimeout(() => this.ws?.close(), 100);
  }

  sendJson(obj) {
    const message = JSON.stringify(obj);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else {
      this.pendingJson.push(message);
    }
  }

  sendBinary(arrayBuffer) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(arrayBuffer);
    } else {
      this.pendingBinary.push(arrayBuffer);
    }
  }

  flushQueues() {
    while (this.pendingJson.length && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(this.pendingJson.shift());
    }
    while (this.pendingBinary.length && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(this.pendingBinary.shift());
    }
  }
}
