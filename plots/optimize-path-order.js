module.exports = function optimizePathOrder (paths, shouldMergePaths = true) {
  if (!paths.length) return paths
  paths = paths.slice()

  let newPaths = []
  newPaths.push(paths[0])

  paths = paths.slice(1)

  while (paths.length) {
    const lastPath = newPaths[newPaths.length - 1]
    const curPt = lastPath[lastPath.length - 1]
    const { idx, reverse } = paths.reduce((closest, path, i) => {
      const firstPt = path[0]
      const lastPt = path[path.length - 1]
      const distanceToFirst = squaredDistance(curPt, firstPt)
      const distanceToLast = squaredDistance(curPt, lastPt)
      if (!closest) {
        return {
          idx: i,
          distance: Math.min(distanceToFirst, distanceToLast),
          reverse: distanceToLast < distanceToFirst
        }
      }
      if (distanceToFirst < closest.distance) {
        return {
          idx: i,
          distance: distanceToFirst,
          reverse: false
        }
      }
      if (distanceToLast < closest.distance) {
        return {
          idx: i,
          distance: distanceToLast,
          reverse: true
        }
      }
      return closest
    }, null)
    const closestPath = paths.splice(idx, 1)[0].slice()
    if (reverse) {
      closestPath.reverse()
    }
    newPaths.push(closestPath)
  }

  if (shouldMergePaths) {
    for (let i = 1; i < newPaths.length; i++) {
      const lastPath = newPaths[i - 1]
      const curPath = newPaths[i]
      if (squaredDistance(curPath[0], lastPath[lastPath.length - 1]) < Math.pow(0.05, 2)) {
        newPaths = mergePaths(newPaths, i - 1, i)
        i -= 1 // now that we've merged, let's correct i for the next round
      }
    }
  }

  return newPaths
}

function mergePaths (paths, path1Idx, path2Idx) {
  // this will help us keep things in order when we do the splicing
  const minIdx = Math.min(path1Idx, path2Idx)
  const maxIdx = Math.max(path1Idx, path2Idx)
  paths = paths.slice()
  const path1 = paths[minIdx]
  const path2 = paths[maxIdx]
  const mergedPath = path1.concat(path2.slice(1))
  paths.splice(maxIdx, 1)
  paths.splice(minIdx, 1, mergedPath)
  return paths
}

// this is the distance between paths - from the end of path 1 to the start of path 2
function getTravelingDistance (paths) {
  let total = 0
  let lastPt = paths[0][paths[0].length - 1]
  for (const path of paths.slice(1)) {
    const squaredDist = squaredDistance(lastPt, path[0])
    total += Math.sqrt(squaredDist)
    lastPt = path[path.length - 1]
  }
  return total
}

function squaredDistance (pt1, pt2) {
  const dx = pt2[0] - pt1[0]
  const dy = pt2[1] - pt1[1]
  return dx * dx + dy * dy
}
