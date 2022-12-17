## Useful commands for axidraw:

axicli -m manual -d 30 -u 60 -M raise_pen
axicli SVGPLOT -d 30 -u 60 -a 18 -z 20 -b

Ex:

axicli 2022.12.14-19.57.40-plot-hash-9215.svg -d 30 -u 60 -a 18 -z 20 -b

## Plot server:

Run the server and then POST to localhost:8080/save-plot with body that looks like:
{
  "filename": "something-something.svg",
  "svg": "..."
}

It will save that SVG to that filename to the CWD wherever the server is run from.
