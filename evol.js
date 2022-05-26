
const IN = {
	HIGH: -1,
	RANDOM: -2,
	VISUAL_RED: -3,
	VISUAL_GREEN: -4,
	VISUAL_BLUE: -5,
	VISUAL_DISTANCE: -6,
	AGE: -7,
	FACE_X: -8,
	FACE_Y: -9,
}
const OUT = {
	TURN: 0,
	MOVE: 2,
	GRAB: 3,
	DROP: 4,
	EAT: 5, // If the forward object is an organism, attack it
	// Any output neuron with a higher number will act as an internal neuron.
}
const NEURONS = {...IN, ...OUT};

class Genome {
	constructor(rgb, lifespanTicks) {
		this.rgb = rgb;
		this.lifespanTicks = lifespanTicks;
		
		// Looks like: {start: neuronId, end: neuronId, weight: {-1 to 1}}
		this.neuronConnections = [];
	}
	
	static makeRandomGenome() {
		const rgb = [Math.random(), Math.random(), Math.random()];
		const lifespanTicks = 500 + Math.floor(Math.random() * 250);
		const newGenome = new Genome(rgb, lifespanTicks);
		newGenome.fillRandomConnections(10);
		return newGenome;
	}
	
	randomNeuron() {
		const keys = Object.keys(NEURONS);
		return NEURONS[keys[keys.length * Math.random() << 0]];
	}
	randomInputNeuron() {
		const keys = Object.keys(IN);
		return IN[keys[keys.length * Math.random() << 0]];
	}
	randomOutputNeuron() {
		// TODO: add internal neurons somehow
		const keys = Object.keys(OUT);
		return OUT[keys[keys.length * Math.random() << 0]];
	}
	
	connectionExists(connection) {
		// Check if a connection from start to end already exists.
		return this.neuronConnections.some(neuronConnection =>
					neuronConnection.start == connection.start &&
					neuronConnection.end == connection.end);
	}
	
	newRandomConnection() {
		return {start: this.randomNeuron(), end: this.randomOutputNeuron(), weight: Math.random() * 8 - 4};
	}
	
	fillRandomConnections(numConnections) {
		// Always add a random movement connection.
		this.neuronConnections.push({start: IN.RANDOM, end: OUT.MOVE, weight: Math.random() * 8 - 4});
		while(this.neuronConnections.length < numConnections) {
			const newConnection = this.newRandomConnection();
			if (!this.connectionExists(newConnection)) {
				this.neuronConnections.push(newConnection);
			}
		}
	}
	
	serialize() {
		return JSON.stringify(this);
	}
	
	static deserialize(genomeStr) {
		const rawObject = JSON.parse(genomeStr);
		const genome = new Genome(rawObject.rgb, rawObject.lifespanTicks);
		genome.neuronConnections = rawObject.neuronConnections;
		return genome;
	}
	
	clone() {
		return Genome.deserialize(this.serialize());
	}
	
	mutateGenome(connectionRate, driftRate) {
		// Add a connection at rate.
		if (Math.random() < connectionRate) {
			const newConnection = this.newRandomConnection();
			if (!this.connectionExists(newConnection)) {
				this.neuronConnections.push(newConnection);
			}
		}
		// Remove a connection at rate.
		if (Math.random() < connectionRate && this.neuronConnections.length > 3) {
			this.neuronConnections.splice(Math.floor(Math.random()*this.neuronConnections.length), 1);
		}
		// Drift the connection weights.
		for(let connection of this.neuronConnections) {
			connection.weight += Math.random() * driftRate - driftRate / 2;
		}
		this.rgb[0] = Math.min(1, Math.max(0, this.rgb[0] + (Math.random() * 2 - 1) * driftRate / 5));
		this.rgb[1] = Math.min(1, Math.max(0, this.rgb[1] + (Math.random() * 2 - 1) * driftRate / 5));
		this.rgb[2] = Math.min(1, Math.max(0, this.rgb[2] + (Math.random() * 2 - 1) * driftRate / 5));
		
		// Don't mutate lifespan in generation mode for some reason.
		//this.lifespanTicks = this.lifespanTicks + this.lifespanTicks / 20 * (Math.random() * 2 - 1) * driftRate;
	}
}

class Brain {
	constructor(genome) {
		this.genome = genome;
		
		this.neuronExcitations = {};
	}
	
	runTick(inputNeuronExcitations) {
		const excitationInputSums = {};
		for (let connection of this.genome.neuronConnections){
			if (!excitationInputSums.hasOwnProperty(connection.end)) excitationInputSums[connection.end] = 0;
			
			if (connection.start in inputNeuronExcitations) {
				// If it's from an input neuron, get from inputs.
				excitationInputSums[connection.end] += inputNeuronExcitations[connection.start] * connection.weight;
			} else if(connection.start in this.neuronExcitations){
				// If its from an internal neuron (which includes output neurons), get from current excitations.
				excitationInputSums[connection.end] += this.neuronExcitations[connection.start] * connection.weight;
			}
		};
		for(let [key, value] of Object.entries(excitationInputSums)) {
			if (!this.neuronExcitations.hasOwnProperty(key)) this.neuronExcitations[key] = 0;
			this.neuronExcitations[key] = Math.tanh(value);
		}
	}
	
	getNeuronExcitation(neuronId) {
		return this.neuronExcitations[neuronId];
	}
}

class Item {
	constructor(x, y, rgb){
		this.type = "item";
		this.x = x;
		this.y = y;
		this.rgb = rgb || [0, 0, 0];
	}
	
	runTick(world){}
}

class Organism extends Item {
	constructor(x, y, genome) {
		super(x, y, genome.rgb);
		
		this.genome = genome;
		this.brain = new Brain(this.genome);
		
		this.type = "organism";
		this.heldItem = null;
		this.facing = [Math.random() < 0.5 ? 1 : -1, Math.random() < 0.5 ? 1 : -1];
		this.ageTicks = 0;
		this.foodEaten = 0;
		this.totalFoodEaten = 0;
		this.reproductionCost = this.calculateReproductionCost();
	}
	
	static makeRandomOrganism(x, y) {
		return new Organism(x, y, Genome.makeRandomGenome());
	}
	
	runTick(world) {
		if (world.grid[this.x][this.y] != this) {
			console.log("location mismatch for", this);
		}
		
		this.ageTicks++;
		
		if (this.ageTicks > this.genome.lifespanTicks) {
			// Die of old age or of death.
			world.removeItem(this);
			return;
		}
		
		this.brain.runTick(this.getInputNeurons(world));
		const turnExcitation = this.brain.getNeuronExcitation(OUT.TURN);
		const moveExcitation = this.brain.getNeuronExcitation(OUT.MOVE);
		const grabExcitation = this.brain.getNeuronExcitation(OUT.GRAB);
		const dropExcitation = this.brain.getNeuronExcitation(OUT.DROP);
		const eatExcitation = this.brain.getNeuronExcitation(OUT.EAT);
		
		// Turn left or right in the elseif.
		if (turnExcitation < -0.5) {
			const [fx,fy] = this.facing;
			if (fx != 0) {
				this.facing[0] = 0;
				// fx is 1 or -1
				// if its 1 we want newfy to be -1, if its -1 we want newfy to be 1
				this.facing[1] = fx * -1;
			}
			if (fy != 0) {
				this.facing[1] = 0;
				// fy is 1 or -1
				// if its -1 we want newfx to be -1, if its -1 we want newfx to be 1
				this.facing[0] = fy;
			}
		} else if (turnExcitation > 0.5) {
			const [fx,fy] = this.facing;
			if (fx != 0) {
				this.facing[0] = 0;
			} else {
				// fx is 1 or -1
				// if its 1 we want newfy to be 1, if its -1 we want newfy to be -1
				this.facing[1] = fx;
			}
			if (fy != 0) {
				this.facing[1] = 0;
			} else {
				// fy is 1 or -1
				// if its -1 we want newfx to be -1, if its -1 we want newfx to be 1
				this.facing[0] = fy * -1;
			}
		}
		
		if (moveExcitation > Math.random()) this.move(world);
		
		// Always eat instead of only when excited. I guess this wouldnt work with holding items.
		const facingItem = world.lookInDirection(this.x, this.y, this.facing, 1);
		if (facingItem?.type == "food") {
			this.foodEaten += 0.5; // TODO: maybe back to 1
			this.totalFoodEaten += 0.5;
			world.removeItem(facingItem);
		}
		if (eatExcitation > 0.5) {
			if (facingItem?.type == "organism") {
				facingItem.ageTicks += 200; // Do 20 ticks of age damage.
				this.foodEaten += 0.001;
				this.totalFoodEaten += 0.001;
			}
		}
		
		// this.tryToBreed(world); // Disable when doing forced generations mode.
		this.addRandomScoreImprovementForStructure(world);
	}
	
	addRandomScoreImprovementForStructure(world) {
		const neighbours = world.getNeighbourhood(this.x, this.y).filter(x => x && x.type == "organism");
		this.totalFoodEaten += neighbours.length / 100;
		// TO TRY:::::::: WHAT IF we get reward for neighbours eating something...
	}
	
	getInputNeurons(world) {
		const sensingDistance = 10;
		const facingItem = world.lookInDirection(this.x, this.y, this.facing, sensingDistance);
		const facingDistance = facingItem ? distance(this, facingItem) / sensingDistance : 1; // This might go over sensingDistance by sqrt(2) but whatever.
		
		const inputNeuronExcitations = {};
		inputNeuronExcitations[IN.HIGH] = 1;
		inputNeuronExcitations[IN.RANDOM] = Math.random();
		inputNeuronExcitations[IN.VISUAL_RED] = facingItem ? facingItem.rgb[0] : 0;
		inputNeuronExcitations[IN.VISUAL_GREEN] = facingItem ? facingItem.rgb[1] : 0;
		inputNeuronExcitations[IN.VISUAL_BLUE] = facingItem ? facingItem.rgb[2] : 0;
		inputNeuronExcitations[IN.VISUAL_DISTANCE] = facingDistance;
		inputNeuronExcitations[IN.AGE] = this.ageTicks / this.genome.lifespanTicks;
		inputNeuronExcitations[IN.FACE_X] = this.facing[0];
		inputNeuronExcitations[IN.FACE_Y] = this.facing[1];
		return inputNeuronExcitations;
	}
	
	move(world) {
		// Look forward at current facing 1 step to see if the space is empty.
		if (world.lookInDirection(this.x, this.y, this.facing, 1)) {
			// If there was an item there, then we failed to move.
			return;
		}
		
		const oldX = this.x;
		const oldY = this.y;
		this.x = modulo(this.x + this.facing[0], world.width);
		this.y = modulo(this.y + this.facing[1], world.height);
		world.moveItem(this, oldX, oldY, this.x, this.y);
	}
	
	tryToBreed(world) {
		if (this.foodEaten > this.reproductionCost) {
			const baby = this.createChild();
			world.addItem(baby);
			this.foodEaten -= this.reproductionCost;
		}
	}
	
	createChild(world) {
		//console.log("Making baby!");
		const newGenome = this.genome.clone();
		//newGenome.mutateGenome(0.05, 0.05);
		//newGenome.mutateGenome(0.1, 0.3);
		newGenome.mutateGenome(0.5, 0.3);
		return new Organism(this.x + 1, this.y + 1, newGenome); // TODO: better place finding.
	}
	
	calculateReproductionCost() {
		// Figure out how much energy this organism takes to create.
		// Normalize around 1 food for 1 baby.
		return ((this.genome.lifespanTicks / 250) + (this.genome.neuronConnections.length / 5)) / 2; // was going to average the 2, but divide by 2 again for balancing
	}
}

class FoodPlant extends Item {
	constructor(x, y) {
		super(x, y, [0, 1, 0]);
		this.type = "food";
	}
}

class Tree extends Item {
	constructor(x, y) {
		super(x, y, [0.75, 0.5, 0.25]);
		this.type = "tree";
	}
}

class Wall extends Item {
	constructor(x, y) {
		super(x, y, [0.05, 0.05, 0.05]);
		this.type = "wall";
	}
}

class World {
	constructor(width, height) {
		this.width = width;
		this.height = height;
		this.grid = Array(this.width).fill(null).map(() => Array(this.height).fill(null));
		this.items = [];
		this.ageTicks = 0;
		
		this.fillWalls();
		for(let p = 0; p < 1000; ++p){
			this.addPlants();
		}
		
		for (let i = 0; i < 100; ++i) {
			for (let j = 0; j < 100; ++j) {
				if (this.grid[i][j]) continue;
				if (Math.random() < 0.05) { // 1% chance to spawn.
					const organism = Organism.makeRandomOrganism(i, j);
					this.grid[i][j] = organism;
					this.items.push(organism);
				}
			}
		}
	}
	
	clearWorld() {
		for (let i = 0; i < 100; ++i) {
			for (let j = 0; j < 100; ++j) {
				this.grid[i][j] = null;
			}
		}
		this.items = [];
	}
	
	fillWalls() {
		for (let i = 0; i < 100; ++i) {
			for (let j = 0; j < 100; ++j) {
				// Create an outline of walls.
				if (i == 0 || i == 99 || j == 0 || j == 99) {
					const wall = new Wall(i, j);
					this.grid[i][j] = wall;
					this.items.push(wall);
				}
			}
		}
	}
	
	addPlants() {
		for (let i = 0; i < 100; ++i) {
			for (let j = 0; j < 100; ++j) {
				if (this.grid[i][j]) continue;
				if (Math.random() < 0.00003) { // 0.03% chance to spawn. (REMOVE A ZERO)
					const plant = new FoodPlant(i, j);
					this.grid[i][j] = plant;
					this.items.push(plant);
				} else if (false && Math.random() < 0.000001) { // 0.0001% chance to spawn.
					const plant = new Tree(i, j);
					this.grid[i][j] = plant;
					this.items.push(plant);
				}
			}
		}
	}
	
	runTick() {
		this.ageTicks++;
		// this.addPlants();
		
		for(let item of this.items) {
			item.runTick(this);
		}
		
		if (this.ageTicks % 100 == 0) {
			this.forceNewGeneration();
		}
	}
	
	moveItem(item, fromX, fromY, toX, toY) {
		this.grid[fromX][fromY] = null;
		this.grid[toX][toY] = item;
	}
	
	removeItem(item) {
		this.grid[item.x][item.y] = null;
		this.items = this.items.filter(x => x != item);
	}
	
	addItem(item) {
		const loc = this.findNearbyEmptySpace(item.x, item.y);
		if (!loc) return false;
		const [x, y] = loc;
		this.grid[x][y] = item;
		this.items.push(item);
		item.x = x;
		item.y = y;
		return true;
	}
	
	
	getNeighbourhood(x, y) {
		const neighbourhood = [];
		for (let i = x-1; i <= x+1; ++i) {
			for (let j = y-1; j <= y+1; ++j) {
				let li = modulo(i, world.width);
				let lj = modulo(j, world.height);
				neighbourhood.push(this.grid[li][lj]);
			}
		}
		return neighbourhood;
	}
	
	findNearbyEmptySpace(x, y) {
		for (let i = x-1; i <= x+1; ++i) {
			for (let j = y-1; j <= y+1; ++j) {
				let li = modulo(i, world.width);
				let lj = modulo(j, world.height);
				if (!this.grid[li][lj]) {
					return [li, lj];
				}
			}
		}
		return null;
	}
	
	lookInDirection(x, y, facing, maxDistance) {
		let observingX = x;
		let observingY = y;
		for (let i = 0; i < maxDistance; ++i) {
			// Just add facing incrementally, modulo the world size.
			observingX = modulo(observingX + facing[0], world.width);
			observingY = modulo(observingY + facing[1], world.height);
			if (this.grid[observingX][observingY]) {
				return this.grid[observingX][observingY];
			}
		}
		return null;
	}
	
	randomEmptySpace() {
		// Scary...
		while(true) {
			const x = Math.floor(Math.random() * 100);
			const y = Math.floor(Math.random() * 100);
			if (!this.grid[x][y]) {
				return [x, y];
			}
		}
	}
	
	forceNewGeneration() {
		const oldItems = this.items;
		this.clearWorld();
		this.fillWalls();
		// If they're on the right side of the screen they live and make 2 children.
		const organisms = oldItems.filter(a => a.type == "organism").sort((a, b) => fitnessScore(b) - fitnessScore(a)); // Sort descending
		console.log(organisms.slice(0, 5).map(a => fitnessScore(a)));
		for (let [i, item] of Object.entries(organisms)) {
			if (i > 20 && Math.random() > 0.1) break;
			let childCount = Math.floor((20 - i) / 20 * 10); 
			for (let c = 0; c < childCount; ++c) {
				const child = item.createChild();
				//world.addItem(child);
				let [x,y] = this.randomEmptySpace();
				child.x = x;
				child.y = y;
				this.grid[x][y] = child;
				this.items.push(child);
			}
		}
		
		for(let p = 0; p < 10; ++p){
			this.addPlants();
		}
	}
}

function fitnessScore(organism) {
	return organism.totalFoodEaten / organism.genome.neuronConnections.length;
}

function modulo(a, n) {
	return ((a % n) + n) % n;
}

function distance(item1, item2) {
	return Math.sqrt(Math.pow(item1.x - item2.x, 2) + Math.pow(item1.y - item2.y, 2));
}