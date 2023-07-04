import {app, ComfyApp} from "/scripts/app.js";
import {$el, ComfyDialog} from "/scripts/ui.js";
import {ClipspaceDialog} from "/extensions/core/clipspace.js";

// Helper function to convert a data URL to a Blob object
function dataURLToBlob(dataURL) {
	const parts = dataURL.split(";base64,");
	const contentType = parts[0].split(":")[1];
	const byteString = atob(parts[1]);
	const arrayBuffer = new ArrayBuffer(byteString.length);
	const uint8Array = new Uint8Array(arrayBuffer);
	for (let i = 0; i < byteString.length; i++) {
		uint8Array[i] = byteString.charCodeAt(i);
	}
	return new Blob([arrayBuffer], {type: contentType});
}

function loadedImageToBlob(image) {
	const canvas = document.createElement("canvas");

	canvas.width = image.width;
	canvas.height = image.height;

	const ctx = canvas.getContext("2d");

	ctx.drawImage(image, 0, 0);

	const dataURL = canvas.toDataURL("image/png", 1);
	return dataURLToBlob(dataURL);
}

async function uploadMask(filepath, formData) {
	await fetch("/upload/mask", {
		method: "POST",
		body: formData
	}).catch(error => {
		console.error("Error:", error);
	});

	ComfyApp.clipspace.imgs[ComfyApp.clipspace["selectedIndex"]] = new Image();
	ComfyApp.clipspace.imgs[ComfyApp.clipspace["selectedIndex"]].src = "/view?" + new URLSearchParams(filepath).toString() + app.getPreviewFormatParam();

	if (ComfyApp.clipspace.images) {
		ComfyApp.clipspace.images[ComfyApp.clipspace["selectedIndex"]] = filepath;
	}

	ClipspaceDialog.invalidatePreview();
}

function prepareRGB(image, backupCanvas, backupCtx) {
	// paste mask data into alpha channel
	backupCtx.drawImage(image, 0, 0, backupCanvas.width, backupCanvas.height);
	const backupData = backupCtx.getImageData(0, 0, backupCanvas.width, backupCanvas.height);

	// refine mask image
	for (let i = 0; i < backupData.data.length; i += 4) {
		if (backupData.data[i + 3] === 255) {
			backupData.data[i + 3] = 0;
			continue
		}

		backupData.data[i + 3] = 255;
		backupData.data[i] = 0;
		backupData.data[i + 1] = 0;
		backupData.data[i + 2] = 0;
	}

	backupCtx.globalCompositeOperation = "source-over";
	backupCtx.putImageData(backupData, 0, 0);
}

class MaskEditorDialog extends ComfyDialog {
	#isDrawingMode = false;
	#isLayoutCreated = false;

	#brush = {
		slider: null,
		max: 100,
		min: 1,
		size: 10,
	};

	#canvases = {
		image: $el("canvas", {
			id: "imageCanvas",
			style: {
				left: "0",
				position: "relative"
			},
		}),
		backup: $el("canvas", {id: "backupCanvas"}),
		brush: $el("canvas", {
			id: "brushCanvas",
			style: {
				position: "absolute",
			},
		}),
		mask: $el("canvas", {
			id: "maskCanvas",
			style: {
				position: "absolute",
			},
		}),
	};

	#last = {
		x: -1,
		y: -1,
		mousePosition: {
			clientX: 0,
			clientY: 0,
		},
		pressure: 1,
		time: 0,
	};

	constructor() {
		super();
		this.element = $el("dialog", {parent: document.body}, [...this.createButtons()]);
	}

	createButtons() {
		return [];
	}

	show() {
		this.#setLayout();
		this.setEventHandler(this.#canvases.brush);

		const canvas = this.#canvases.mask
		let ctx = canvas.getContext("2d");
		ctx.lineWidth = 1;
		ctx.strokeStyle = "#000";

		this.#setImages();

		if (ComfyApp.clipspace_return_node) {
			this.saveButton.innerText = "Save to node";
		} else {
			this.saveButton.innerText = "Save";
		}
		this.saveButton.disabled = false;

		this.element.style.visibility = "hidden";
		this.element.showModal();

		setTimeout(() => {
			this.element.style.width = `${this.#canvases.mask.width}px`;
			this.element.style.visibility = "visible";
		}, 150)
	}

	#setLayout() {
		const brushSizeSlider = this.createBrushSlider("Thickness", (event) => {
			this.#brush.size = Number(event.target.value);
		});

		const clearButton = $el("button", {
			textContent: "Clear",
			onclick: () => {
				const {backup, mask} = this.#canvases;
				mask.getContext("2d").clearRect(0, 0, mask.width, mask.height);
				backup.getContext("2d").clearRect(0, 0, backup.width, backup.height);
			},
			style: {
				cssFloat: "left",
				marginRight: "4px",
			},
		});

		const cancelButton = $el("button", {
			innerText: "Cancel",
			onclick: () => {
				document.removeEventListener("keydown", this.handleKeyDown.bind(this));
				this.close();
			},
			style: {
				cssFloat: "right",
				marginLeft: "4px",
			},
		});

		this.saveButton = $el("button", {
			innerText: "Save",
			onclick: () => {
				document.removeEventListener("keydown", this.handleKeyDown.bind(this));
				this.save().then();
			},
			style: {
				cssFloat: "right",
				marginLeft: "4px",
			},
		});

		const bottom_panel = $el("div", [
			$el("div", {
				style: {
					display: "grid",
					cssFloat: "right",
				},
			}, [this.saveButton, cancelButton]),
			$el("div", {
				style: {
					display: "grid",
					gap: "0.5rem",
					cssFloat: "left",
				},
			}, [brushSizeSlider, clearButton])
		])

		this.element.appendChild(this.#canvases.image);
		this.element.appendChild(this.#canvases.mask);
		this.element.appendChild(this.#canvases.brush);
		this.element.appendChild(bottom_panel);

		this.#isLayoutCreated = true;
	}

	createBrushSlider(name, callback) {
		this.#brush.slider = $el("input", {
			type: "range",
			min: 1,
			max: 100,
			value: 10,
			onchange: callback,
		});

		return $el("div.comfy-mask-editor-slider", {id: "maskeditor-slider"}, [
			$el("label", {textContent: name}),
			this.#brush.slider,
		]);
	}

	#setImages() {
		const {backup, brush, image, mask} = this.#canvases;

		const imgCtx = image.getContext("2d");
		const backupCtx = backup.getContext("2d");
		const maskCtx = mask.getContext("2d");

		backupCtx.clearRect(0, 0, backup.width, backup.height);
		imgCtx.clearRect(0, 0, image.width, image.height);
		maskCtx.clearRect(0, 0, mask.width, mask.height);

		// image load
		const orig_image = new Image();
		window.addEventListener("resize", () => {
			// repositioning
			image.width = window.innerWidth - 250;
			image.height = window.innerHeight - 200;

			// redraw image
			let drawWidth = orig_image.width;
			let drawHeight = orig_image.height;
			if (orig_image.width > image.width) {
				drawWidth = image.width;
				drawHeight = (drawWidth / orig_image.width) * orig_image.height;
			}

			if (drawHeight > image.height) {
				drawHeight = image.height;
				drawWidth = (drawHeight / orig_image.height) * orig_image.width;
			}

			image.height = drawHeight;
			this.element.style.width = `${drawWidth}px`;

			imgCtx.drawImage(orig_image, 0, 0, drawWidth, drawHeight);

			// update mask
			mask.width = drawWidth;
			mask.height = drawHeight;
			mask.style.top = image.offsetTop + "px";
			mask.style.left = image.offsetLeft + "px";

			backupCtx.drawImage(mask, 0, 0, mask.width, mask.height, 0, 0, backup.width, backup.height);
			maskCtx.drawImage(backup, 0, 0, backup.width, backup.height, 0, 0, mask.width, mask.height);

			brush.width = drawWidth;
			brush.height = drawHeight;
			brush.style.left = image.offsetLeft + "px";
			brush.style.top = image.offsetTop + "px";
		});

		const touched_image = new Image();

		touched_image.onload = function () {
			backup.width = touched_image.width;
			backup.height = touched_image.height;

			prepareRGB(touched_image, backup, backupCtx);
		};

		const alpha_url = new URL(ComfyApp.clipspace.imgs[ComfyApp.clipspace["selectedIndex"]].src)
		alpha_url.searchParams.delete("channel");
		alpha_url.searchParams.delete("preview");
		alpha_url.searchParams.set("channel", "a");
		touched_image.src = alpha_url.toString();

		// original image load
		orig_image.onload = function () {
			window.dispatchEvent(new Event("resize"));
		};

		const rgb_url = new URL(ComfyApp.clipspace.imgs[ComfyApp.clipspace["selectedIndex"]].src);
		rgb_url.searchParams.delete("channel");
		rgb_url.searchParams.set("channel", "rgb");
		orig_image.src = rgb_url.toString();
		this.image = orig_image;
	}

	setEventHandler(brushCanvas) {
		brushCanvas.addEventListener("contextmenu", (event) => {
			event.preventDefault();
		});

		brushCanvas.addEventListener("wheel", this.#handleWheelEvent.bind(this));
		brushCanvas.addEventListener("mousedown", this.#handleMouseDown.bind(this));
		brushCanvas.addEventListener("mousemove", this.#handleMouseMove.bind(this));
		brushCanvas.addEventListener("mouseout", this.#handleMouseOut.bind(this));
		brushCanvas.addEventListener("mouseup", this.#handleMouseUp.bind(this));
		document.addEventListener("pointerup", this.handlePointerUp.bind(this));
		brushCanvas.addEventListener("pointerdown", this.#handlePointerDown.bind(this));
		brushCanvas.addEventListener("pointermove", this.#drawMove.bind(this));
		brushCanvas.addEventListener("touchmove", this.#drawMove.bind(this));
		document.addEventListener("keydown", this.handleKeyDown.bind(this));
	}

	#handleWheelEvent(event) {
		if (event.deltaY < 0) {
			this.#brush.size = Math.min(this.#brush.size + 2, 100);
		} else {
			this.#brush.size = Math.max(this.#brush.size - 2, 1);
		}

		this.#brush.slider.value = this.#brush.size;
		this.updateBrushPreview(event);
	}

	handleKeyDown(event) {
		switch (event.code) {
			case "BracketRight":
				this.#brush.size = Math.min(this.#brush.size + 2, this.#brush.max);
				break;
			case "BracketLeft":
				this.#brush.size = Math.max(this.#brush.size - 2, this.#brush.min);
				break;
			case "Enter":
				this.save().then();
				break;
			default:
				break;
		}

		this.#brush.slider.value = this.#brush.size;
		this.updateBrushPreview(this.#last.mousePosition);
	}

	updateBrushPreview(event) {
		const rect = this.#canvases.brush.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;

		const canvas = this.#canvases.brush;
		const ctx = canvas.getContext("2d");
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.beginPath();
		ctx.setLineDash([5, 15]);
		ctx.strokeStyle = "white";
		ctx.lineWidth = 1.5;
		ctx.arc(x, y, this.#brush.size, 0, Math.PI * 2, false);
		ctx.stroke();
	}

	#drawMove(event) {
		event.preventDefault();

		this.updateBrushPreview(event);

		const maskCtx = this.#canvases.mask.getContext("2d");
		let diff = performance.now() - this.#last.time;
		if (window.TouchEvent && event instanceof TouchEvent || event.buttons === 1) {
			const maskRect = this.#canvases.mask.getBoundingClientRect();

			let x = event.offsetX;
			let y = event.offsetY;

			if (event.offsetX == null) {
				x = event.targetTouches[0].clientX - maskRect.left;
			}

			if (event.offsetY == null) {
				y = event.targetTouches[0].clientY - maskRect.top;
			}

			let brush_size = this.#brush.size;
			if (event instanceof PointerEvent && event.pointerType === "pen") {
				brush_size *= event.pressure;
				this.#last.pressure = event.pressure;
			} else if (window.TouchEvent && event instanceof TouchEvent && diff < 20) {
				// The firing interval of PointerEvents in Pen is unreliable, so it is supplemented by TouchEvents.
				brush_size *= this.#last.pressure;
			} else {
				brush_size = this.#brush.size;
			}

			if (diff > 20 && !this.#isDrawingMode) {
				requestAnimationFrame(() => {
					maskCtx.beginPath();
					maskCtx.fillStyle = "rgb(0,0,0)";
					maskCtx.globalCompositeOperation = "source-over";
					maskCtx.arc(x, y, brush_size, 0, Math.PI * 2, false);
					maskCtx.fill();
					this.#last.x = x;
					this.#last.y = y;
				});
			} else {
				requestAnimationFrame(() => {
					maskCtx.beginPath();
					maskCtx.fillStyle = "rgb(0,0,0)";
					maskCtx.globalCompositeOperation = "source-over";

					const dx = x - this.#last.x;
					const dy = y - this.#last.y;

					const distance = Math.sqrt(dx * dx + dy * dy);
					const directionX = dx / distance;
					const directionY = dy / distance;

					for (let i = 0; i < distance; i += 5) {
						const px = this.#last.x + (directionX * i);
						const py = this.#last.y + (directionY * i);
						maskCtx.arc(px, py, brush_size, 0, Math.PI * 2, false);
						maskCtx.fill();
					}
					this.#last.x = x;
					this.#last.y = y;
				});
			}

			this.#last.time = performance.now();
		} else if (event.buttons === 2 || event.buttons === 5 || event.buttons === 32) {
			const maskRect = this.#canvases.mask.getBoundingClientRect();
			const x = event.offsetX || event.targetTouches[0].clientX - maskRect.left;
			const y = event.offsetY || event.targetTouches[0].clientY - maskRect.top;

			let brushSize = this.#brush.size;
			if (event instanceof PointerEvent && event.pointerType === "pen") {
				brushSize *= event.pressure;
				this.#last.pressure = event.pressure;
			} else if (window.TouchEvent && event instanceof TouchEvent && diff < 20) {
				brushSize *= this.#last.pressure;
			} else {
				brushSize = this.#brush.size;
			}

			if (diff > 20 && !this.#isDrawingMode) { // cannot tracking #isDrawingMode for touch event
				requestAnimationFrame(() => {
					maskCtx.beginPath();
					maskCtx.globalCompositeOperation = "destination-out";
					maskCtx.arc(x, y, brushSize, 0, Math.PI * 2, false);
					maskCtx.fill();
					this.#last.x = x;
					this.#last.y = y;
				});
			} else {
				requestAnimationFrame(() => {
					maskCtx.beginPath();
					maskCtx.globalCompositeOperation = "destination-out";

					const dx = x - this.#last.x;
					const dy = y - this.#last.y;

					const distance = Math.sqrt(dx * dx + dy * dy);
					const directionX = dx / distance;
					const directionY = dy / distance;

					for (let i = 0; i < distance; i += 5) {
						const px = this.#last.x + (directionX * i);
						const py = this.#last.y + (directionY * i);
						maskCtx.arc(px, py, brushSize, 0, Math.PI * 2, false);
						maskCtx.fill();
					}
					this.#last.x = x;
					this.#last.y = y;
				});
			}

			this.#last.time = performance.now();
		}
	}

	#handleMouseDown(event) {
		const {brush} = this.#canvases;
		this.#isDrawingMode = true;
		let rect = brush.getBoundingClientRect();
		let x = event.clientX - rect.left;
		let y = event.clientY - rect.top;
		this.#drawBrush(brush.getContext("2d"), x, y);
	}

	#handleMouseMove(event) {
		this.#last.mousePosition.clientX = event.clientX;
		this.#last.mousePosition.clientY = event.clientY;

		const {brush} = this.#canvases;
		const ctx = brush.getContext("2d");

		const rect = brush.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;
		if (this.#isDrawingMode) {
			ctx.clearRect(0, 0, brush.width, brush.height);
		}
		this.#drawBrush(ctx, x, y);
	}

	#handleMouseOut() {
		const {brush} = this.#canvases;
		brush.getContext("2d").clearRect(0, 0, brush.width, brush.height);
	}

	#handleMouseUp() {
		this.#isDrawingMode = false;
	}

	#drawBrush(ctx, x, y) {
		ctx.beginPath();
		ctx.arc(x, y, this.#brush.size, 0, Math.PI * 2, false);
		ctx.stroke();
	}

	#handlePointerDown(event) {
		let brushSize = this.#brush.size;
		if (event instanceof PointerEvent && event.pointerType === "pen") {
			brushSize *= event.pressure;
			this.#last.pressure = event.pressure;
		}

		if ([0, 2, 5].includes(event.button)) {
			event.preventDefault();
			this.#isDrawingMode = true;

			const {mask} = this.#canvases;
			const maskRect = mask.getBoundingClientRect();
			const x = event.offsetX || event.targetTouches[0].clientX - maskRect.left;
			const y = event.offsetY || event.targetTouches[0].clientY - maskRect.top;

			const ctx = mask.getContext("2d");
			ctx.beginPath();
			if (event.button === 0) {
				ctx.fillStyle = "rgb(0,0,0)";
				ctx.globalCompositeOperation = "source-over";
			} else {
				ctx.globalCompositeOperation = "destination-out";
			}
			ctx.arc(x, y, brushSize, 0, Math.PI * 2, false);
			ctx.fill();

			this.#last.x = x;
			this.#last.y = y;
			this.#last.time = performance.now();
		}
	}

	handlePointerUp(event) {
		event.preventDefault();
		this.#isDrawingMode = false;
	}

	async save() {
		const {backup, mask} = this.#canvases;
		const backupCtx = backup.getContext("2d", {willReadFrequently: true});

		backupCtx.clearRect(0, 0, backup.width, backup.height);
		backupCtx.drawImage(mask,
			0, 0, mask.width, mask.height,
			0, 0, backup.width, backup.height);

		// paste mask data into alpha channel
		const backupData = backupCtx.getImageData(0, 0, backup.width, backup.height);

		// refine mask image
		for (let i = 0; i < backupData.data.length; i += 4) {
			if (backupData.data[i + 3] === 255) {
				backupData.data[i + 3] = 0;
			} else {
				backupData.data[i + 3] = 255;
			}

			backupData.data[i] = 0;
			backupData.data[i + 1] = 0;
			backupData.data[i + 2] = 0;
		}

		backupCtx.globalCompositeOperation = "source-over";
		backupCtx.putImageData(backupData, 0, 0);

		const filename = `clipspace-mask-${performance.now()}.png`;

		const item = {
			"filename": filename,
			"subfolder": "clipspace",
			"type": "input",
		};

		if (ComfyApp.clipspace.images) {
			ComfyApp.clipspace.images[0] = item;
		}

		if (ComfyApp.clipspace.widgets) {
			const widget = ComfyApp.clipspace.widgets.find(obj => obj.name === "image");
			if (widget !== undefined) {
				widget.value = item;
			}
		}

		const original_url = new URL(this.image.src);
		const original_ref = {filename: original_url.searchParams.get("filename")};

		const original_subfolder = original_url.searchParams.get("subfolder");
		if (original_subfolder) {
			original_ref.subfolder = original_subfolder;
		}

		const original_type = original_url.searchParams.get("type");
		if (original_type) {
			original_ref.type = original_type;
		}

		const formData = new FormData();
		const dataURL = this.#canvases.backup.toDataURL();
		formData.append("image", dataURLToBlob(dataURL), filename);
		formData.append("original_ref", JSON.stringify(original_ref));
		formData.append("type", "input");
		formData.append("subfolder", "clipspace");

		this.saveButton.innerText = "Saving...";
		this.saveButton.disabled = true;
		await uploadMask(item, formData);
		ComfyApp.onClipspaceEditorSave();
		this.close();
	}
}

app.registerExtension({
	name: "Comfy.MaskEditor",
	init() {
		ComfyApp.open_maskeditor = function () {
			document.querySelectorAll("dialog").forEach((dialog) => {
				dialog.close();
			});

			const dialog = new MaskEditorDialog(app);
			dialog.show();
		};

		const context_predicate = () => ComfyApp.clipspace && ComfyApp.clipspace.imgs && ComfyApp.clipspace.imgs.length > 0;
		ClipspaceDialog.registerButton("Mask Editor", context_predicate, ComfyApp.open_maskeditor);
	}
});