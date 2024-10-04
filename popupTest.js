let gridSize = 10;
let chunkSize = 4;
let adjacentChunks = 1;
let chunkSystem = false;

let table = document.getElementById("table");
let calcCells = [];

let chunkLength = Math.ceil(gridSize / chunkSize)

let elements = []
let cells = [];
for (let i = 0; i < chunkSize; i++) {
    cells.push([])
    for (let j = 0; j < chunkSize; j++) {
        cells[i].push([])
    }
}



/*for (let i = 0; i < chunkSize; i++) {
    let row = document.createElement("tr");
    table.appendChild(row);
    console.log(i)
    let chunkPosX = 1;
    let chunkX = 0;
    for (let j = 0; j < gridSize; j++) {
        if (chunkPosX > chunkLength) {
            chunkPosX = 1;
            chunkX++
        }
        let column = document.createElement("td")
        column.classList.add("table-entry", "glowy")
        column.opacity = "0";
        row.appendChild(column)
        column.setAttribute("X", chunkX)
        chunkPosX++
    }
}*/

let chunkPosY = 1;
let chunkY = 0;

for (let i = 0; i < gridSize; i++) {
    if (chunkPosY > chunkLength) {
        chunkPosY = 1;
        chunkY++
    }
    let row = document.createElement("tr");
    table.appendChild(row);
    console.log(i)
    let chunkPosX = 1;
    let chunkX = 0;
    for (let j = 0; j < gridSize; j++) {
        if (chunkPosX > chunkLength) {
            chunkPosX = 1;
            chunkX++
        }
        let column = document.createElement("td")
        column.classList.add("table-entry", "glowy")
        column.opacity = "0";
        row.appendChild(column)
        if (chunkSystem) {
            column.setAttribute("Y", chunkY)
            column.setAttribute("X", chunkX)
            cells[chunkY][chunkX].push(column)
            chunkPosX++
            column.addEventListener("mouseover", (event) => {
                console.log(column)
                TitleAnimation(event, parseInt(column.getAttribute("x")), parseInt(column.getAttribute("y")))
            })
        }
        else {
            elements.push(column)
        }
    }
    chunkPosY++
}

if (!chunkSystem) {
    document.addEventListener("mousemove", ((event) => TitleAnimation(event, -1, -1)))
}

console.log(cells)

let brightness = 1;
let size = 0.2;
let minValue = 0;
let maxValue = 1;
let trailLength = 1

//TitleAnimation();

function TitleAnimation(event, X, Y) {
    if (chunkSystem) {
        let calcCellOld = calcCells;
        calcCells = []
        for (let Xi = Math.max(X - adjacentChunks, 0); Xi <= Math.min(X + adjacentChunks, chunkSize - 1); Xi++) {
            for (let Yi = Math.max(Y - adjacentChunks, 0); Yi <= Math.min(Y + adjacentChunks, chunkSize - 1); Yi++) {
                calcCells.push(...cells[Yi][Xi])
            }
        }

        calcCellOld.map((element) => {
            let test = calcCells.indexOf(element)
            if (calcCells.indexOf(element) == -1) {
                element.setAttribute("style", `opacity: 0 transition: opacity ease ${trailLength * 0.5}s`);
            }
        })
    } else {
        calcCells = elements
    }

    console.log(calcCells)
    for (let i = 0; i < calcCells.length; i++) {
        let element = calcCells[i]
        // Get the element's position
        const rect = element.getBoundingClientRect();
        const elementX = rect.left + rect.width / 2;  // Element's center X position
        const elementY = rect.top + rect.height / 2;  // Element's center Y position

        // Get the cursor's position
        const cursorX = event.clientX;
        const cursorY = event.clientY;

        // Calculate the distance using the Pythagorean theorem
        const distance = Math.sqrt(Math.pow(elementX - cursorX, 2) + Math.pow(elementY - cursorY, 2));
        let oldOpacity = window.getComputedStyle(element).getPropertyValue("opacity");
        let opacity = Math.min(Math.max((-distance / (size * 300)) + brightness, minValue), maxValue)
        element.setAttribute("style", `opacity: ${opacity}; ${opacity <= oldOpacity ? "transition: opacity ease " + trailLength * 0.5 + "s" : ""}`);
        element.opacity = opacity
    }
}