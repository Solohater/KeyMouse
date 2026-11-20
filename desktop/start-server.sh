#!/usr/bin/env bash
export PATH="/home/etechsc/.nvm/versions/node/v22.23.1/bin:/home/etechsc/Android/Sdk/platform-tools:/usr/local/bin:/usr/bin:/bin:$PATH"
export DISPLAY=:0
export XDG_RUNTIME_DIR="/run/user/$(id -u)"

cd /home/etechsc/Personal/p/KeyMouse/desktop
exec npm run start
