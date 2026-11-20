export function getWebClientHtml(hostIp: string, port: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="icon" type="image/png" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAKO0lEQVR4nJWXWYxl11WGv73PPvfcc8+dpxq7u3qyy902JJGZTMBlSJSkJZCI1PWYSMlDBFKwsAMKykNViUFERCIWUsgLROKNcgh5gCeE+nYiK45jbCfutrvdQ3XXPN/5nnlvHsrV2CYWnfW8z7++s9Ye/iX4BcMYIxZbLQvgrb09A3Ch0RC0WiwuLqZCCPOLaj5kZsSyWbb+v2XvrhEPK/uhCxcWFmRrcU5CiyYXzYtiPgX41r//sLJjDn63P+j9ZhrHp02qwVgrWWm/VA2d//zql+a7AJeXl60LjcaRfqull5aW9EMDXDbL1nHC4/j0l19wPvX5C891ev0v+2E8ESUpaaIhFVgGrNTgKrXeLJe/+a9/8aMXrl5dSt6nubxsvTj/fs2fD2AWJGJJf+3Nqyfak8GlHT18spl407+RmZzx3WQ27Pm0R6N0ZFITplpILfCwTVW4oqxcS2VdQF6/cdBb9eNkvWo7r7oD/z+ef+qpjQVj5JIQ+kMBjim/sP695zolFg7ycbGQZpm3LiJJOIiH6fW9fbkR9MVu1CWHwtISSyuyxuZMtm5my1O6XMxbRkv+e30LtMYOko7s+n/+108//e0PVuIBwHHZP7f2vWd70/Y31wdbFCInuez9EsIxohNF4scbm7KULzFZKHJte4vdZEheZhEpEBuSYcLpTJknJ87oquuYjb22+dnOLnkrq0q5EtZB54t/Ofdb//ReCAFHG25paUn/4a1/O3GvNrq1kRmqSpQVn/UuSJWRdJOEVza3qBWKxFnBIIk4l6lx66DNmt/FEw6OtvASm7jj89H6OKeaY3TafdYPB/hhmmIsUYgYjJvR2a8888y+MUYIIYwEONrtsJuL/mC/IpxMpMzveOdkmEk5SCJeWlunG8WUcnm6cQpk2PcDGGkeyTT5mDfNY26THFkaxRpevsS+HyCyWT55+gxPn5qxhJHauIXiSJcuARzfJeqoAS0A0baTJz088/HcCcgYDqKYV+5t8vjYNAL4ycoqj52cIfADtrc6zE5OU3Bz6CQlZ2ymvTpSCxKtEakBI1hLEgoZxa9MTXBvPzRR4n8c+Ofj1iuAORb1VZbMGN7kRWZE5IyEn8Drq9ucqNUYuAlaC842x3jjndtUVI7Zkyfoy4TN7h4FstQsDzkKyDgOJorY3dplOBxRzeU53ThFWTriY5MVcXfkNwEu7s2ZIwBjxCKYX3vnHeeme3iyTUAYI3549z7VrEe9WuFGexfPyeFqkIlg6uw4e/hEvZgxu0B5pDjY2CDjZKlOjhEMfLYPD/Fcj4N2H/p3uTB5XghleKRZP2WMkYAGkAutliWEMK2Vl58LMun5ThSmr62sywvNE9hGcfv+LjOFSawh3Lu/y+OPnaUrEvrDkLydwxsarl27we2NDSrVMlGQUMjmaZYbFNwStXKDMIaV9XXZ7w7TSLsf+dvll78ohDALV64oAYiF73zHWc32b53+9C9P/+BgX+dcTxbrJTKJ4GBjn9CAFWtmZqbZlSGDXkjWZGjGDquv3iRA8viZs9QqFfxeSNnNsr67i8Amh0IHmlFnyKlKXU8V6vLaT9648alZ9cTc3FwqAbOR+BcNZvqgNzJxYqRbKbJ22GY/CqhWKnR6Xc6dOcmBjBgOQuxUolKJTAVuvsSjp89RrTfptgNELDGRJvFTVGpBLBkvVSjla+x0QukPR0ZrZltvR7MPjmGso/PSVibEpDudPXQvoujkcbRiZXWTjz7yKDsmoNcPsROFndqoQIJWzM4+SqVUprPbJx2m5O0sB7ttdGhQqWS8WKbgFZmu13DtPHFitFJZojA8ByABEq01xpBTGVJhuHv7JmPawd/qULAdAge63RF2LFGJRSa2ySSKeKTpHo4Y7Y8wvqHkFem2e3QGMcI41AtlhHDY2epDKhkvF8AIhLAM2PIBgEy4S5KKsrGtmlcmkoafXnuDrftr1Mpl/EGME1lkYoXzbnI7VqjEggB0KCjn8kS9HsNhxNlTZxirVOm2A0ZDTRoLkshArPFsWxq0cB21cgwg6pG5biE3Ck5OnHRrWllZbNvFcVwcMqhAkQltMqHCDiV2KFGxwAoNIhIUCwXiYRcdRUyNjdM/GODZORxp09/vUyoU8EcxaK3zBU9YktXSTPwWGCEXrlyx/u755/1Gqf4Pxs5yolQxdVVCWllsO0vcjymJHHYksWMLO7JQEViBhggKxTzhoM/a+jbFYhUTCURo8NsBBTdPKeeyv3lIMIrIFz0jnRzFgvOtZy9dCheutCyBMUJIaf7lpfvu6unujf2CPhkNRvr+Rlu2+yPyieTi+cfoRZqoF2OlIGJQSIrFIoN2h2gUMz09xd7aNnWvhhIOo56Pl3PxMhY72z2mJiu6WCxKO+rd2tx6+Yk//sxnIgFIhDBGazH/1En/x+2b265RuMoxT0xMMOmVGAQhd27eooSiXixRzOUplwrUaiUG7UMSP2aiOYnfTRirT9Lv9dFRQrVcRmmN3x1wbqaOm7GNoyTrO8nas5cuhYsgOD6GLC4KY4zoR4Pw9c1rlGIb27K5ODHG6WqD7sjnzTffZP3uHboHu3T391i5eYu9jU3OTU1hRilpNyTqxNTLTYZ9n+5hj2DoU2+UUVJSUCnrGyOGPgkgWDx6jCTA5cWLQghhxlRhK9Ga1+5cN14ssKRkdmqME7UxsDJ0e122N7fZ2do76n+myNbdDSoZh7ztoocpIpQU3DzDns/4WBULG4eUO/f6Jg5sCpJ9wDDXkg9ewwutI/eaj+zrdtFjPzzgtVvv8MTMeRJpcWaiidQ2w2FETmZQqYXCxk4tgkHI3toujeYEqSUwUYAJA2bPTiCFRJmYt293iUKbZiND4pufHf373P9WgLk5DVCPct/N9ISpeCXCSJuf3lxBhgIpJOebDaa8EnZi4egMjs6gjEPOKTPoa/bWdxCRj4l8Tk7UyCqLnEy4tdIh8C2TtT2Cfl+TDr//rgXRDwCWhNCXl5etpV//xFvOiK9XK01VyuY1qUlu315NvUjqrFD6dL2iZypVkxMZGAmSviEaghQuQWAIA980GjVtW5b2rEjfWTlMk0gluYxriqWSSsLB1/9k/szNy8vGWlo6csfvdcXi8vKy/O78fPqnP/ivb5B1nretLKN+SBbFo1MnEdIhTlLSSKdxgNGxQGqEUpZRlhCOzFquUggdc+fegFRnyefy6CgwaTj8xnPzzT+7vGysF+eFBswHAY7CGIEQ5m+uXv1VXG9eJ3xk6EcNE6vCqfFxYaGKCVYVAzJJkQaUZWNLRSaND+NI9N6+3U8xmUE57+64tvW6xXD5S78/9dqxEX1vOvV/AIQwC8bIrwrxCvDKMeW3X33VfuGv/lF87Y9+r7g7FL89ODx8KhkFM8ISFEql1Uat9CPPTlpf+fvb3csXGnpp6Zn3TUYLxkjxgaHk51fgPR/Qaknm5vQHp5mHjSMNJHN8qMZDT7EYI+CocceW+thYXm+0BMDi3FwqHqg+3Jj+P8hYG3b049ulAAAAAElFTkSuQmCC">
  <title>kiMo Mobile Controller</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f8fafc;
      color: #0f172a;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    header {
      padding: 10px 16px;
      background: #ffffff;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #e2e8f0;
    }
    .brand {
      font-weight: 700;
      font-size: 16px;
      letter-spacing: 0.5px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .badge {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #ef4444;
    }
    .badge.connected {
      background: #22c55e;
      box-shadow: 0 0 8px #22c55e;
    }
    .status-text {
      font-size: 13px;
      color: #64748b;
    }
    .tabs {
      display: flex;
      background: #ffffff;
      border-bottom: 1px solid #e2e8f0;
    }
    .tab-btn {
      flex: 1;
      padding: 10px;
      background: none;
      border: none;
      color: #64748b;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      text-align: center;
      transition: all 0.2s;
    }
    .tab-btn.active {
      color: #06b6d4;
      border-bottom: 2px solid #06b6d4;
      background: rgba(6, 182, 212, 0.08);
    }
    .tab-content {
      flex: 1;
      display: none;
      flex-direction: column;
      overflow: hidden;
    }
    .tab-content.active {
      display: flex;
    }
    /* Touchpad styling */
    #touchpad-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 12px;
      gap: 12px;
    }
    #touchpad {
      flex: 1;
      background: radial-gradient(circle at center, #ffffff 0%, #f1f5f9 100%);
      border: 2px dashed #cbd5e1;
      border-radius: 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #64748b;
      font-size: 14px;
      position: relative;
    }
    #touchpad.active-touch {
      border-color: #06b6d4;
      background: #f8fafc;
      box-shadow: 0 0 16px rgba(6, 182, 212, 0.15);
    }
    .mouse-buttons {
      display: flex;
      height: 60px;
      gap: 12px;
    }
    .mouse-btn {
      flex: 1;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      color: #0f172a;
      font-size: 15px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .mouse-btn:active {
      background: #06b6d4;
      color: #ffffff;
    }
    /* Keyboard styling */
    #keyboard-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 8px;
      gap: 6px;
      overflow-y: auto;
      justify-content: center;
    }
    .key-row {
      display: flex;
      gap: 6px;
      justify-content: center;
      width: 100%;
    }
    .key {
      flex: 1;
      height: 48px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      color: #0f172a;
      font-size: 15px;
      font-weight: 500;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    .key:active, .key.pressed {
      background: #06b6d4;
      color: #ffffff;
      transform: translateY(2px);
    }
    .key.special {
      background: #f1f5f9;
      color: #334155;
      font-size: 12px;
      font-weight: 600;
    }
    .key.space {
      flex: 4;
    }
    .text-input-bar {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
      padding: 0 4px;
    }
    .text-input-bar input {
      flex: 1;
      padding: 10px 14px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      color: #0f172a;
      font-size: 15px;
      outline: none;
    }
    .text-input-bar button {
      padding: 10px 18px;
      background: #06b6d4;
      border: none;
      border-radius: 8px;
      color: #ffffff;
      font-weight: 700;
      cursor: pointer;
    }
    /* Sensitivity bar */
    .controls-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 8px;
      font-size: 12px;
      color: #64748b;
    }
    .controls-bar input {
      flex: 1;
    }
    /* Pairing overlay: no secrets are embedded in this page. */
    #auth-overlay {
      position: fixed;
      inset: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: rgba(15, 23, 42, 0.55);
      backdrop-filter: blur(4px);
    }
    #auth-overlay.hidden {
      display: none;
    }
    .auth-card {
      width: 100%;
      max-width: 360px;
      background: #ffffff;
      border-radius: 18px;
      padding: 24px;
      box-shadow: 0 24px 60px rgba(15, 23, 42, 0.3);
      text-align: center;
    }
    .auth-card h1 {
      font-size: 22px;
      margin-bottom: 8px;
      color: #0f172a;
    }
    .auth-card p {
      font-size: 14px;
      color: #64748b;
      margin-bottom: 12px;
      line-height: 1.4;
    }
    .auth-card code {
      background: #f1f5f9;
      padding: 2px 6px;
      border-radius: 6px;
      color: #0f172a;
    }
    #auth-pin {
      width: 100%;
      padding: 14px;
      margin: 8px 0 14px;
      font-size: 26px;
      letter-spacing: 10px;
      text-align: center;
      border: 2px solid #cbd5e1;
      border-radius: 12px;
      outline: none;
      color: #0f172a;
    }
    #auth-pin:focus {
      border-color: #06b6d4;
    }
    #auth-btn {
      width: 100%;
      padding: 13px;
      border: none;
      border-radius: 12px;
      background: #06b6d4;
      color: #ffffff;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
    }
    #auth-btn:active {
      transform: translateY(1px);
    }
    #auth-error {
      min-height: 20px;
      margin-top: 12px;
      font-size: 13px;
      color: #ef4444;
    }
  </style>
</head>
<body>
  <div id="auth-overlay">
    <div class="auth-card">
      <h1>Connect to kiMo</h1>
      <p>Enter the 6-digit pairing PIN shown on your PC.</p>
      <p>Run <code>kimo status</code> in a terminal on the PC to see it.</p>
      <input id="auth-pin" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="one-time-code">
      <button id="auth-btn">Connect</button>
      <div id="auth-error"></div>
    </div>
  </div>
  <header>
    <div class="brand">
      <img src="data:image/png;base64,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" style="width:22px; height:22px; border-radius:6px; vertical-align:middle; margin-right:6px;" alt="PocketInput Logo" />
      <span class="badge" id="conn-badge"></span>
      <span>kiMo</span>
    </div>
    <div class="status-text" id="status-text">Connecting...</div>
  </header>

  <div class="tabs">
    <button class="tab-btn active" onclick="switchTab('mouse')">🖱 Touchpad</button>
    <button class="tab-btn" onclick="switchTab('keyboard')">⌨ Keyboard</button>
  </div>

  <div id="tab-mouse" class="tab-content active">
    <div class="controls-bar">
      <span>Sensitivity</span>
      <input type="range" id="sensitivity-slider" min="1" max="4" step="0.2" value="2.0">
      <span id="sens-val">2.0x</span>
    </div>
    <div id="touchpad-container">
      <div id="touchpad">
        <p>📱 Slide 1 finger to move</p>
        <p style="font-size: 12px; margin-top: 6px;">Tap to Left Click &bull; 2-Finger Tap for Right Click</p>
        <p style="font-size: 12px; margin-top: 2px;">2-Finger Drag to Scroll</p>
      </div>
      <div class="mouse-buttons">
        <button class="mouse-btn" id="btn-left">Left Click</button>
        <button class="mouse-btn" id="btn-right">Right Click</button>
      </div>
    </div>
  </div>

  <div id="tab-keyboard" class="tab-content">
    <div id="keyboard-container">
      <div class="text-input-bar">
        <input type="text" id="quick-text" placeholder="Type text & hit Send to type on PC...">
        <button onclick="sendQuickText()">Send</button>
      </div>

      <!-- Quick Shortcuts Row -->
      <div class="key-row">
        <button class="key special" onclick="sendShortcut('copy')">Ctrl+C</button>
        <button class="key special" onclick="sendShortcut('paste')">Ctrl+V</button>
        <button class="key special" onclick="sendShortcut('undo')">Ctrl+Z</button>
        <button class="key special" onclick="sendShortcut('select_all')">Ctrl+A</button>
        <button class="key special" onclick="sendShortcut('alt_tab')">Alt+Tab</button>
      </div>

      <!-- Numbers Row -->
      <div class="key-row">
        <button class="key special" onclick="sendKey('Esc')">Esc</button>
        <button class="key" onclick="sendKey('1')">1</button>
        <button class="key" onclick="sendKey('2')">2</button>
        <button class="key" onclick="sendKey('3')">3</button>
        <button class="key" onclick="sendKey('4')">4</button>
        <button class="key" onclick="sendKey('5')">5</button>
        <button class="key" onclick="sendKey('6')">6</button>
        <button class="key" onclick="sendKey('7')">7</button>
        <button class="key" onclick="sendKey('8')">8</button>
        <button class="key" onclick="sendKey('9')">9</button>
        <button class="key" onclick="sendKey('0')">0</button>
        <button class="key special" onclick="sendKey('Backspace')">⌫</button>
      </div>

      <!-- QWERTY Row 1 -->
      <div class="key-row">
        <button class="key special" onclick="sendKey('Tab')">Tab</button>
        <button class="key" onclick="sendKey('q')">Q</button>
        <button class="key" onclick="sendKey('w')">W</button>
        <button class="key" onclick="sendKey('e')">E</button>
        <button class="key" onclick="sendKey('r')">R</button>
        <button class="key" onclick="sendKey('t')">T</button>
        <button class="key" onclick="sendKey('y')">Y</button>
        <button class="key" onclick="sendKey('u')">U</button>
        <button class="key" onclick="sendKey('i')">I</button>
        <button class="key" onclick="sendKey('o')">O</button>
        <button class="key" onclick="sendKey('p')">P</button>
      </div>

      <!-- QWERTY Row 2 -->
      <div class="key-row">
        <button class="key" onclick="sendKey('a')">A</button>
        <button class="key" onclick="sendKey('s')">S</button>
        <button class="key" onclick="sendKey('d')">D</button>
        <button class="key" onclick="sendKey('f')">F</button>
        <button class="key" onclick="sendKey('g')">G</button>
        <button class="key" onclick="sendKey('h')">H</button>
        <button class="key" onclick="sendKey('j')">J</button>
        <button class="key" onclick="sendKey('k')">K</button>
        <button class="key" onclick="sendKey('l')">L</button>
        <button class="key special" onclick="sendKey('Enter')" style="flex: 1.5">Enter ↵</button>
      </div>

      <!-- QWERTY Row 3 -->
      <div class="key-row">
        <button class="key special" id="shift-btn" onclick="toggleShift()">Shift ⇧</button>
        <button class="key" onclick="sendKey('z')">Z</button>
        <button class="key" onclick="sendKey('x')">X</button>
        <button class="key" onclick="sendKey('c')">C</button>
        <button class="key" onclick="sendKey('v')">V</button>
        <button class="key" onclick="sendKey('b')">B</button>
        <button class="key" onclick="sendKey('n')">N</button>
        <button class="key" onclick="sendKey('m')">M</button>
        <button class="key special" onclick="sendKey('ArrowUp')">▲</button>
      </div>

      <!-- Bottom Row -->
      <div class="key-row">
        <button class="key special" onclick="sendKey('Control')">Ctrl</button>
        <button class="key special" onclick="sendKey('Super')">⊞</button>
        <button class="key special" onclick="sendKey('Alt')">Alt</button>
        <button class="key space" onclick="sendKey('Space')">Space</button>
        <button class="key special" onclick="sendKey('ArrowLeft')">◀</button>
        <button class="key special" onclick="sendKey('ArrowDown')">▼</button>
        <button class="key special" onclick="sendKey('ArrowRight')">▶</button>
      </div>
    </div>
  </div>

  <script>
    const serverHost = window.location.hostname || '${hostIp}';
    const serverPort = window.location.port || '${port}';
    const isLocalHost = ['127.0.0.1', 'localhost', '::1'].includes(serverHost);

    let ws = null;
    let isConnected = false;
    let pairingPin = '';
    let authToken = '';
    let reconnectTimer = null;
    let lastAuthError = '';
    let shiftActive = false;
    let sensitivity = 2.0;

    const authOverlay = document.getElementById('auth-overlay');
    const authPinInput = document.getElementById('auth-pin');
    const authError = document.getElementById('auth-error');

    function showAuth(message) {
      if (authOverlay) authOverlay.classList.remove('hidden');
      if (authError) authError.textContent = message || '';
      if (authPinInput) {
        authPinInput.value = '';
        setTimeout(() => authPinInput.focus(), 50);
      }
    }

    function hideAuth() {
      if (authOverlay) authOverlay.classList.add('hidden');
      if (authError) authError.textContent = '';
    }

    function submitPin() {
      const value = (authPinInput?.value || '').replace(/\D/g, '');
      if (value.length !== 6) {
        if (authError) authError.textContent = 'Enter the 6-digit PIN shown on your PC.';
        return;
      }
      pairingPin = value;
      authToken = '';
      lastAuthError = '';
      connect();
    }

    document.getElementById('auth-btn')?.addEventListener('click', submitPin);
    authPinInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submitPin();
    });


    const sensSlider = document.getElementById('sensitivity-slider');
    const sensVal = document.getElementById('sens-val');
    sensSlider.addEventListener('input', (e) => {
      sensitivity = parseFloat(e.target.value);
      sensVal.textContent = sensitivity.toFixed(1) + 'x';
    });

    function switchTab(tab) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      if (tab === 'mouse') {
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        document.getElementById('tab-mouse').classList.add('active');
      } else {
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        document.getElementById('tab-keyboard').classList.add('active');
      }
    }

    function updateStatus(connected, text) {
      const badge = document.getElementById('conn-badge');
      const label = document.getElementById('status-text');
      if (connected) {
        badge.classList.add('connected');
        label.textContent = text || 'Connected to PC';
        label.style.color = '#4ade80';
      } else {
        badge.classList.remove('connected');
        label.textContent = text || 'Disconnected';
        label.style.color = '#ef4444';
      }
    }

    function connect() {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (!isLocalHost && !pairingPin && !authToken) {
        showAuth();
        return;
      }
      updateStatus(false, 'Connecting to ws://' + serverHost + ':' + serverPort + '...');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(protocol + '//' + serverHost + ':' + serverPort);

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'auth',
          payload: {
            pin: pairingPin || undefined,
            token: authToken || undefined,
            deviceName: 'Web Browser',
            platform: 'Web'
          }
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'auth_response') {
            if (msg.payload.success) {
              isConnected = true;
              authToken = msg.payload.token || authToken;
              pairingPin = '';
              lastAuthError = '';
              hideAuth();
              updateStatus(true, 'Connected to PC');
            } else {
              isConnected = false;
              lastAuthError = msg.payload.error || 'Pairing failed';
              showAuth(lastAuthError);
              ws.close();
            }
          }
        } catch (e) {}
      };

      ws.onclose = () => {
        const wasConnected = isConnected;
        isConnected = false;
        if (lastAuthError) {
          showAuth(lastAuthError);
          return;
        }
        if (wasConnected || authToken) {
          updateStatus(false, 'Connection lost. Reconnecting...');
          reconnectTimer = setTimeout(connect, 2000);
        } else {
          showAuth('Could not connect. Is the kiMo companion running?');
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    if (isLocalHost) {
      hideAuth();
      connect();
    } else {
      showAuth();
    }

    function send(msg) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    }

    // Touchpad Gesture Tracking
    const touchpad = document.getElementById('touchpad');
    let lastX = 0;
    let lastY = 0;
    let touchStartTime = 0;
    let touchMoved = false;
    let touchCount = 0;
    let lastScrollY = 0;

    touchpad.addEventListener('touchstart', (e) => {
      e.preventDefault();
      touchCount = e.touches.length;
      touchStartTime = Date.now();
      touchMoved = false;
      touchpad.classList.add('active-touch');

      if (e.touches.length === 1) {
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        lastScrollY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      }
    });

    touchpad.addEventListener('touchmove', (e) => {
      e.preventDefault();
      touchMoved = true;

      if (e.touches.length === 1) {
        const curX = e.touches[0].clientX;
        const curY = e.touches[0].clientY;
        const dx = (curX - lastX) * sensitivity;
        const dy = (curY - lastY) * sensitivity;
        lastX = curX;
        lastY = curY;

        send({
          type: 'mouse_move',
          payload: { dx, dy }
        });
      } else if (e.touches.length === 2) {
        const curScrollY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const deltaY = (lastScrollY - curScrollY) * 0.15; // inverted for natural scroll
        lastScrollY = curScrollY;

        if (Math.abs(deltaY) > 0.5) {
          send({
            type: 'mouse_scroll',
            payload: { dy: Math.round(deltaY) }
          });
        }
      }
    });

    touchpad.addEventListener('touchend', (e) => {
      e.preventDefault();
      touchpad.classList.remove('active-touch');
      const duration = Date.now() - touchStartTime;

      // Tap detection (under 250ms and barely moved)
      if (!touchMoved && duration < 250) {
        if (touchCount === 1) {
          // Left click
          send({ type: 'mouse_click', payload: { button: 'left' } });
        } else if (touchCount === 2) {
          // Right click
          send({ type: 'mouse_click', payload: { button: 'right' } });
        }
      }
    });

    // Dedicated Mouse Buttons
    const btnLeft = document.getElementById('btn-left');
    const btnRight = document.getElementById('btn-right');

    btnLeft.addEventListener('touchstart', (e) => {
      e.preventDefault();
      send({ type: 'mouse_button', payload: { button: 'left', action: 'down' } });
    });
    btnLeft.addEventListener('touchend', (e) => {
      e.preventDefault();
      send({ type: 'mouse_button', payload: { button: 'left', action: 'up' } });
    });

    btnRight.addEventListener('touchstart', (e) => {
      e.preventDefault();
      send({ type: 'mouse_button', payload: { button: 'right', action: 'down' } });
    });
    btnRight.addEventListener('touchend', (e) => {
      e.preventDefault();
      send({ type: 'mouse_button', payload: { button: 'right', action: 'up' } });
    });

    // Keyboard handlers
    function sendKey(key) {
      if (navigator.vibrate) navigator.vibrate(15);
      const modifiers = [];
      if (shiftActive) modifiers.push('Shift');
      send({
        type: 'key_press',
        payload: { key, modifiers }
      });
      if (shiftActive) {
        shiftActive = false;
        document.getElementById('shift-btn').classList.remove('pressed');
      }
    }

    function toggleShift() {
      shiftActive = !shiftActive;
      const btn = document.getElementById('shift-btn');
      if (shiftActive) btn.classList.add('pressed');
      else btn.classList.remove('pressed');
    }

    function sendShortcut(shortcut) {
      if (navigator.vibrate) navigator.vibrate(20);
      send({
        type: 'shortcut',
        payload: { shortcut }
      });
    }

    function sendQuickText() {
      const input = document.getElementById('quick-text');
      const text = input.value;
      if (!text) return;
      send({
        type: 'type_text',
        payload: { text }
      });
      input.value = '';
    }
  </script>
</body>
</html>`;
}
