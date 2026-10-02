# Battleship

A browser-based Battleship game: you against a computer opponent.

**Play it here:** https://maryannvmooney-svg.github.io/devin-battleship-demo/

No accounts, sign-ins, API keys, or paid services are needed. It is a plain HTML/CSS/JavaScript site with no build step.

## Rules

- Each side has a 10×10 board and five ships: Carrier (5), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2).
- Place your ships manually (with rotation) or use **Random placement**. Ships cannot overlap or extend off the board.
- Take turns firing at the enemy board. A ship sinks when every square of it has been hit. Sink the whole enemy fleet to win.
- You cannot fire at the same square twice or fire during the computer's turn.

## The computer opponent

The computer only learns what a human opponent would be told after each of its shots: *miss*, *hit*, or *sunk* (and which ship). It never sees where your ships are.

- **Searching:** it counts how many ways each remaining enemy ship could still fit on each unexplored square and fires where a ship is most likely to be.
- **Targeting:** after a hit it only considers ship positions that pass through its unresolved hits, so it tries neighbouring squares and then continues along the line once it finds the ship's direction.

## Project layout

| File | Purpose |
| --- | --- |
| `index.html` | Page structure and instructions |
| `styles.css` | Responsive styling for desktop and mobile |
| `src/game.js` | Game rules, boards, turns, and computer opponent (no browser code) |
| `src/main.js` | Connects the rules to the page (clicks, rendering, messages) |
| `tests/game.test.js` | Automated tests for the rules and the computer opponent |
| `BUG_REPORT.md` | Bugs found during testing and how they were fixed |
| `.github/workflows/pages.yml` | Runs the tests and publishes the site to GitHub Pages |

## Running locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Running the tests

Requires Node.js 18 or newer (no packages to install):

```bash
npm test
```
