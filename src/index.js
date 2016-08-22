import includeFont from './common/include-font'
import config from '../config'

includeFont({ url: 'https://fonts.googleapis.com/css?family=Space+Mono:700' })

const projects = config.include

const container = document.createElement('div')
container.className = 'container'
container.innerHTML = `
  <h2>Sketches</h2>
  <ul>
    ${projects.map(name => `<li><a href="${name}.html">${name}</a></li>`).join('')}
  </ul>
`

const style = document.createElement('style')
style.innerText = `
  body {
    color: #666;
    font-family: "Space Mono", sans-serif;
    text-align: center;
  }
  .container {
    width: 84vw;
    max-width: 640px;
    margin: 6vh auto;
    opacity: 0;
    transition: opacity 250ms ease;
  }
  .container.show {
    opacity: 1;
  }
  h2 {
    border-bottom: 3px dashed #555;
    padding-bottom: 60px;
    font-size: 64px;
    margin-bottom: 60px;
  }
  li {
    margin: 2.5rem;
    font-size: 42px;
  }
  li a {
    text-decoration: none;
    color: #777;
    transition: color 250ms ease-in-out;
  }
  li a:hover {
    color: #6ca8dc;
  }
`

document.head.appendChild(style)
document.body.appendChild(container)

setTimeout(() => container.classList.add('show'), 500)
