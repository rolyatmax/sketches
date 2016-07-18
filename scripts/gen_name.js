const fs = require('fs')
const path = require('path')

const nouns = ('age alibi alpenglow atm bay beast beet bit blood bracelet ' +
  'cabana cane canteen cartload catamaran centimeter chaise chalice clip ' +
  'complement cot cough crown dahlia daniel delivery demand detail doubter ' +
  'dragon dresser elevator establishment exchange faculty grandmom hackwork ' +
  'highlight hostel hurricane indigence infancy jackal jasmine judo latte ' +
  'law libra mangrove manufacturer maybe meter mine misplacement misreading ' +
  'mop mountain move museum parade pig porcupine protest receipt recliner ' +
  'reef repair repeat replace resist respite roundabout rowboat russian ' +
  'senator session shallot shark shop skylight sloth sofa software spaghetti ' +
  'spectrograph stepmother steven streetcar tandem theism trellis trinket ' +
  'tummy tunic velodrome vestment virtue weasel wombat yacht').split(' ')

const adjectives = ('adamant adroit amatory animistic antic arcadian baleful ' +
  'bellicose bilious boorish calamitous caustic cerulean comely concomitant ' +
  'contumacious corpulent crapulous defamatory didactic dilatory dowdy ' +
  'efficacious effulgent egregious endemic equanimous execrable fastidious ' +
  'feckless fecund friable fulsome garrulous guileless gustatory heuristic ' +
  'histrionic hubristic incendiary insidious insolent intransigent ' +
  'inveterate invidious irksome jejune jocular judicious lachrymose limpid ' +
  'loquacious luminous mannered mendacious meretricious minatory mordant ' +
  'munificent nefarious noxious obtuse parsimonious pendulous pernicious ' +
  'pervasive petulant platitudinous precipitate propitious puckish querulous ' +
  'quiescent rebarbative recalcitrant redolent rhadamanthine risible ' +
  'ruminative sagacious salubrious sartorial sclerotic serpentine spasmodic ' +
  'strident taciturn tenacious tremulous trenchant turbulent turgid ' +
  'ubiquitous uxorious verdant voluble voracious wheedling withering zealous')
  .split(' ')

const pickWord = (wordList) => wordList[Math.random() * wordList.length | 0]
const generateName = () => `${pickWord(adjectives)}-${pickWord(nouns)}`

function exists (name) {
  try {
    fs.accessSync(path.join(process.cwd(), `${name}.js`))
  } catch (e) {
    if (e.code === 'ENOENT') return false
    throw e
  }
  return true
}

let name
while (!name || exists(name)) {
  name = generateName()
}

process.stdout.write(name)
