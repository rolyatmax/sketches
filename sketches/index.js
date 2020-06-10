import includeFont from './common/include-font'
import config from '../config'

includeFont({ url: 'https://fonts.googleapis.com/css?family=Space+Mono:700' })

const projects = config.include

const container = document.createElement('div')
container.className = 'container'
container.innerHTML = `
  <h2>Sketches</h2>
  <p>Note: many of these sketches only work in desktop browsers</p>
  <ul>
    ${projects.map(name => `<li><a href="${name}.html"><img src="resources/screenshots/${name}.png" /></a></li>`).join('')}
  </ul>
`

const style = document.createElement('style')
style.innerText = `
  body {
    color: #666;
    font-family: "Space Mono", sans-serif;
    text-align: center;
    align-items: initial;
  }
  .container {
    width: 84vw;
    max-width: 960px;
    margin: 30px auto;
    opacity: 0;
    transition: opacity 250ms ease;
  }
  .container.show {
    opacity: 1;
  }
  h2 {
    font-size: 48px;
    margin: 0;
  }
  p {
    font-size: 14px;
  }
  ul {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    margin-top: 40px;
    border-top: 2px dashed #888;
    padding-top: 40px;
  }
  li {
    margin: 1rem;
    width: 260px;
    height: 190px;
    font-size: 42px;
    list-style: none;
    transform: scale(1);
    transition: transform cubic-bezier(.22,.61,.36,1) 300ms;
  }
  li img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  li a {
    text-decoration: none;
  }
  li:hover {
    transform: scale(1.05);
  }
`

document.head.appendChild(style)
document.body.appendChild(container)

setTimeout(() => container.classList.add('show'), 500)
