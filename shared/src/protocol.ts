/**
 * PocketInput Shared Communication Protocol
 */

export type MouseButton = 'left' | 'right' | 'middle';

export type KeyModifier = 'Ctrl' | 'Shift' | 'Alt' | 'Meta';

export type ShortcutType = 
  | 'copy' 
  | 'paste' 
  | 'undo' 
  | 'redo' 
  | 'select_all' 
  | 'alt_tab' 
  | 'cut'
  | 'save'
  | 'find';

// Client to Server Messages
export type AuthMessage = {
  type: 'auth';
  payload: {
    pin?: string;
    token?: string;
    deviceName: string;
    platform: string;
  };
};

export type MouseMoveMessage = {
  type: 'mouse_move';
  payload: {
    dx: number;
    dy: number;
  };
};

export type MouseClickMessage = {
  type: 'mouse_click';
  payload: {
    button: MouseButton;
    double?: boolean;
  };
};

export type MouseButtonMessage = {
  type: 'mouse_button';
  payload: {
    button: MouseButton;
    action: 'down' | 'up';
  };
};

export type MouseScrollMessage = {
  type: 'mouse_scroll';
  payload: {
    dx?: number;
    dy: number;
  };
};

export type KeyDownMessage = {
  type: 'key_down';
  payload: {
    key: string;
    code?: number;
    modifiers?: KeyModifier[];
  };
};

export type KeyUpMessage = {
  type: 'key_up';
  payload: {
    key: string;
    code?: number;
  };
};

export type KeyPressMessage = {
  type: 'key_press';
  payload: {
    key: string;
    code?: number;
    modifiers?: KeyModifier[];
  };
};

export type TypeTextMessage = {
  type: 'type_text';
  payload: {
    text: string;
  };
};

export type ShortcutMessage = {
  type: 'shortcut';
  payload: {
    shortcut: ShortcutType;
  };
};

export type PingMessage = {
  type: 'ping';
  payload: {
    timestamp: number;
  };
};

export type ClientMessage =
  | AuthMessage
  | MouseMoveMessage
  | MouseClickMessage
  | MouseButtonMessage
  | MouseScrollMessage
  | KeyDownMessage
  | KeyUpMessage
  | KeyPressMessage
  | TypeTextMessage
  | ShortcutMessage
  | PingMessage;

// Server to Client Messages
export type AuthResponseMessage = {
  type: 'auth_response';
  payload: {
    success: boolean;
    token?: string;
    error?: string;
    deviceName?: string;
  };
};

export type StatusMessage = {
  type: 'status';
  payload: {
    connected: boolean;
    serverName: string;
    os: string;
    displayServer: string;
    paired: boolean;
  };
};

export type PongMessage = {
  type: 'pong';
  payload: {
    timestamp: number;
    serverTime: number;
  };
};

export type ErrorMessage = {
  type: 'error';
  payload: {
    code: string;
    message: string;
  };
};

export type ServerMessage =
  | AuthResponseMessage
  | StatusMessage
  | PongMessage
  | ErrorMessage;

export function isValidClientMessage(data: any): data is ClientMessage {
  if (!data || typeof data !== 'object' || typeof data.type !== 'string') {
    return false;
  }
  const validTypes = [
    'auth',
    'mouse_move',
    'mouse_click',
    'mouse_button',
    'mouse_scroll',
    'key_down',
    'key_up',
    'key_press',
    'type_text',
    'shortcut',
    'ping'
  ];
  return validTypes.includes(data.type);
}
