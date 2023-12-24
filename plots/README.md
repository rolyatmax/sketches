## Useful commands for axidraw:

axicli -m manual -d 30 -u 60 -M raise_pen
axicli -m manual -d 30 -u 60 -M lower_pen
axicli SVGPLOT -d 30 -u 60 -a 18 -z 20 -b

Ex:

axicli 2023.12.11-20.09.04-plot-hash-867.svg -d 30 -u 60 -a 18 -z 20 -b

## Plot server:

Run the server and then POST to localhost:8080/save-plot with body that looks like:
{
  "filename": "something-something.svg",
  "svg": "..."
}

It will save that SVG to that filename to the CWD wherever the server is run from.
