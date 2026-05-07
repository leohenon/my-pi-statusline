# my-pi-statusline

Personal Pi statusline extension for my setup. Based from `pi-powerline-footer`.

![my-pi-statusline](./statusline.png)

## Pi config

`~/.pi/agent/settings.json` should load this package from GitHub:

```json
{
  "packages": ["git:github.com/leohenon/my-pi-statusline"],
  "powerline": {
    "preset": "default",
    "fixedEditor": false,
    "vim": true
  }
}
```

`"vim": true` is required so [`pi-vim`](https://github.com/leohenon/pi-vim) publishes its mode state through the statusline bridge.
