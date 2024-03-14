# School DIM -- DIMotus

School project, Motus alike (the tv show) with websocket and Node.js

## Game rules

This game is designed for 2+ players. One of these players, once the game has started, will be elected as the "Game master". He will have to choose a word to guess (he can also generate one randomly by clicking on "random word").

This word must be between 6 and 12 characters. Pay attention to accents, in this game they count! Capital letters are not counted. Characters like: - & * / + [] () etc or numbers are not allowed

Once the word is chosen, the other players will have to guess the word in 8 tries, the less is better. The first letter of the word is offered.

With each proposal, the proposed word will be displayed in the grid, designating a try. The green letters are the well-placed letters. The letters in yellow exist in the word, but are not in the right place. The others do not exist in the word.

For example, if the Game master chooses Banana, and a player writes Savana, the 3 "a" and the "n" will be in green.

As soon as a player finds the word, the game stops and he wins. If no one finds it within the number of tries allowed, the Game Master wins.

## Getting started

Clone the project
With node and nodemon installed, run :
```
npm i
nodemon
```
Go to http://localhost:3308/ and enjoy !