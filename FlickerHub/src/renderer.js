const DEFAULT_POSITIONS = [
  { x: 25, y: 28 },
  { x: 75, y: 28 },
  { x: 25, y: 72 },
  { x: 75, y: 72 }
];

export class StimulusRenderer {
  constructor(stageElement) {
    this.stageElement = stageElement;
    this.shape = "circle";
    this.targets = [];
  }

  setShape(shape) {
    this.shape = shape;
    this.targets.forEach((target) => {
      this.applyShapeClass(target.element);
    });
  }

  setTargets(targets) {
    this.targets = targets.map((target, index) => {
      const element = document.createElement("div");
      element.className = `stimulus ${target.colorClass}`;
      element.style.color = "#000000";
      this.applyShapeClass(element);

      const label = document.createElement("div");
      label.className = "stimulus-label";
      label.textContent = target.label;

      const position = target.position || DEFAULT_POSITIONS[index] || DEFAULT_POSITIONS[0];
      element.style.left = `${position.x}%`;
      element.style.top = `${position.y}%`;
      element.appendChild(label);
      this.stageElement.appendChild(element);

      return {
        ...target,
        element
      };
    });
  }

  clearTargets() {
    this.stageElement.innerHTML = "";
    this.targets = [];
  }

  update(sampledTargets) {
    sampledTargets.forEach((sample, index) => {
      const target = this.targets[index];
      if (!target) {
        return;
      }
      const intensity = Math.max(0, Math.min(1, sample.intensity));
      const gray = Math.round(intensity * 255);
      const grayHex = gray.toString(16).padStart(2, "0");
      target.element.style.color = `#${grayHex}${grayHex}${grayHex}`;
      target.element.style.opacity = "1";
      target.element.dataset.active = sample.active ? "1" : "0";
    });
  }

  applyShapeClass(element) {
    element.classList.remove("shape-circle", "shape-square", "shape-outline", "shape-block");
    switch (this.shape) {
      case "square":
        element.classList.add("shape-square");
        break;
      case "outline":
        element.classList.add("shape-outline");
        break;
      case "block":
        element.classList.add("shape-block");
        break;
      case "circle":
      default:
        element.classList.add("shape-circle");
        break;
    }
  }
}
