# sketches

all my sketches i think?

Take a look here: [rolyatmax.github.io/sketches](https://rolyatmax.github.io/sketches/).

Older sketches and scripts can be found at [commit `e328189`](https://github.com/rolyatmax/sketches/tree/e32818944ca3827f4376d624c5669b252e2f799f).


------------

TODO (remove me before landing):

 - [ ] Create a new index.html gallery using canvas-sketch
 - [ ] Write the build script for gallery
        - load config + `.build` file listing all the src hashes of the current build's sketches
        - check for changes to the `config.js` by comparing hashes
        - go through list of all sketches in config comparing the hashed src of each with the hash in `.build`
        - rebuild all changed sketches + `index.html`
        - rewrite `.build`, updating the changed hashes
        - follow-up: support --force flag to skip the hash checks
        - follow-up: support --sketch flag to run the update only for a specific sketch (+ index.html)
 - [ ] Figure out which sketches in `/sketches` should be added to the config
 - [ ] Figure out which old sketches to bring over (these are the good ones:)
          - animistic-meter
          - antic-grandmom
          - baleful-virtue
          - boorish-trellis
          - corpulent-porcupine
          - defamatory-roundabout
          - didactic-protest
          - equanimous-hackwork
          - insidious-libra
          - irksome-stepmother
          - jejune-mop
          - jocular-replace
          - loquacious-infancy
          - nefarious-cartload
          - pernicious-maybe
          - redolent-hostel
          - rhadamanthine-cartload
          - ruminative-steven
          - voluble-russian
          - wheedling-tummy
