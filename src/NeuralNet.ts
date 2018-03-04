export class NeuralNet {
  private InputNodes: Node[];
  private HiddenLayer: Node[];
  private OutputNodes: Node[];

  public constructor(numInputs: number, numHidden: number, numOutputs: number) {
    this.InputNodes = new Array<Node>(numInputs).fill(new Node());
    this.HiddenLayer = new Array<Node>(numInputs).fill(new Node());
    this.OutputNodes = new Array<Node>(numInputs).fill(new Node());

    this.InputNodes.forEach(n => {
      this.HiddenLayer.forEach(() => n.edges.push(0));
    });

    this.HiddenLayer.forEach(n => {
      this.OutputNodes.forEach(() => n.edges.push(0));
    });
  }

  private resetValues(nodes: Node[]): void {
    nodes.forEach(n => (n.value = 0));
  }
  public getOutput(InputValues: number[]): number {
    for (let i = 0; i < InputValues.length; i++) {
      this.InputNodes[i].value = InputValues[i];
    }
    this.resetValues(this.HiddenLayer);
    this.resetValues(this.OutputNodes);

    this.InputNodes.forEach(n => {
      for (let i = 0; i < this.HiddenLayer.length; i++) {
        this.HiddenLayer[i].value += n.value * n.edges[i];
      }
    });

    this.HiddenLayer.forEach(n => {
      for (let i = 0; i < this.OutputNodes.length; i++) {
        this.OutputNodes[i].value += n.value * n.edges[i];
      }
    });

    let highestValue = 0;
    let highestKey = -1;
    for (let i = 0; i < this.OutputNodes.length; i++) {
      let n = this.OutputNodes[i];
      if (n.value > highestValue) {
        highestValue = n.value;
        highestKey = i;
      }
    }

    return highestKey;
  }
}

class Node {
  public edges: number[];
  public value: number;

  public constructor() {
    this.edges = new Array<number>();
    this.value = 0;
  }
}
