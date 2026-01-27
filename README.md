cgithub is a lightweight GitHub alternative frontend. It has no bloated
JavaScript and doesn't require API keys. To use it, host cgithub on your own
server then replace `github.com` in your URL with your domain.

## Development

To run the server locally:
```
$ pnpm run dev
```

To run tests:
```
$ pnpm test
```

## Deployment

Assuming you have a server `jupiter`, you might deploy like:
```
$ pnpm run build
$ rsync -av --del dist jupiter:/opt/cgithub
```

To configure systemd socket activation use a `cgithub.socket` file:
```
[Socket]
ListenStream=/run/cgithub/socket
SocketGroup=nginx
SocketMode=0660

[Install]
WantedBy=sockets.target
```

And a service file `cgithub.service`:
```
[Unit]
After=cgithub.socket
Requires=cgithub.socket

[Service]
Type=exec
WorkingDirectory=/opt/cgithub
ExecStart=/usr/bin/node dist/build/index.js
DynamicUser=true
```

An nginx config snippet might be:
```
location / {
    proxy_pass http://unix:/run/cgithub/socket;
}
```

## Disclosures

AI coding assistants, in particular Claude, are used in the development process.

[Phospor Icons](https://phosphoricons.com/) used under MIT license.
