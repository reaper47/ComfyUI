import {api} from "./api.js";

export function $el(tag, propsOrChildren, children) {
	const split = tag.split(".");
	const element = document.createElement(split.shift());
	if (split.length > 0) {
		element.classList.add(...split);
	}

	if (propsOrChildren) {
		if (Array.isArray(propsOrChildren)) {
			element.append(...propsOrChildren);
		} else {
			const {parent, $: cb, dataset, style} = propsOrChildren;
			delete propsOrChildren.parent;
			delete propsOrChildren.$;
			delete propsOrChildren.dataset;
			delete propsOrChildren.style;

			if (Object.hasOwn(propsOrChildren, "for")) {
				element.setAttribute("for", propsOrChildren.for)
			}

			if (Object.hasOwn(propsOrChildren, "data-i18n-key")) {
				element.setAttribute("data-i18n-key", propsOrChildren["data-i18n-key"])
			}

			if (style) {
				Object.assign(element.style, style);
			}

			if (dataset) {
				Object.assign(element.dataset, dataset);
			}

			Object.assign(element, propsOrChildren);
			if (children) {
				element.append(...children);
			}

			if (parent) {
				parent.append(element);
			}

			if (cb) {
				cb(element);
			}
		}
	}
	return element;
}

function dragElement(dragEl, settings) {
	var posDiffX = 0,
		posDiffY = 0,
		posStartX = 0,
		posStartY = 0,
		newPosX = 0,
		newPosY = 0;
	if (dragEl.getElementsByClassName("drag-handle")[0]) {
		// if present, the handle is where you move the DIV from:
		dragEl.getElementsByClassName("drag-handle")[0].onmousedown = dragMouseDown;
	} else {
		// otherwise, move the DIV from anywhere inside the DIV:
		dragEl.onmousedown = dragMouseDown;
	}

	// When the element resizes (e.g. view queue) ensure it is still in the windows bounds
	const resizeObserver = new ResizeObserver(() => {
		ensureInBounds();
	}).observe(dragEl);

	function ensureInBounds() {
		if (dragEl.classList.contains("comfy-menu-manual-pos")) {
			newPosX = Math.min(document.body.clientWidth - dragEl.clientWidth, Math.max(0, dragEl.offsetLeft));
			newPosY = Math.min(document.body.clientHeight - dragEl.clientHeight, Math.max(0, dragEl.offsetTop));

			positionElement();
		}
	}

	function positionElement() {
		const halfWidth = document.body.clientWidth / 2;
		const anchorRight = newPosX + dragEl.clientWidth / 2 > halfWidth;

		// set the element's new position:
		if (anchorRight) {
			dragEl.style.left = "unset";
			dragEl.style.right = document.body.clientWidth - newPosX - dragEl.clientWidth + "px";
		} else {
			dragEl.style.left = newPosX + "px";
			dragEl.style.right = "unset";
		}

		dragEl.style.top = newPosY + "px";
		dragEl.style.bottom = "unset";

		if (savePos) {
			localStorage.setItem(
				"Comfy.MenuPosition",
				JSON.stringify({
					x: dragEl.offsetLeft,
					y: dragEl.offsetTop,
				})
			);
		}
	}

	function restorePos() {
		let pos = localStorage.getItem("Comfy.MenuPosition");
		if (pos) {
			pos = JSON.parse(pos);
			newPosX = pos.x;
			newPosY = pos.y;
			positionElement();
			ensureInBounds();
		}
	}

	let savePos = undefined;
	settings.addSetting({
		id: "Comfy.MenuPosition",
		name: "Save menu position",
		type: "boolean",
		defaultValue: savePos,
		i18nKey: "extensions.core.menuPosition",
		onChange(value) {
			if (savePos === undefined && value) {
				restorePos();
			}
			savePos = value;
		},
	});

	function dragMouseDown(e) {
		e = e || window.event;
		e.preventDefault();
		// get the mouse cursor position at startup:
		posStartX = e.clientX;
		posStartY = e.clientY;
		document.onmouseup = closeDragElement;
		// call a function whenever the cursor moves:
		document.onmousemove = elementDrag;
	}

	function elementDrag(e) {
		e = e || window.event;
		e.preventDefault();

		dragEl.classList.add("comfy-menu-manual-pos");

		// calculate the new cursor position:
		posDiffX = e.clientX - posStartX;
		posDiffY = e.clientY - posStartY;
		posStartX = e.clientX;
		posStartY = e.clientY;

		newPosX = Math.min(document.body.clientWidth - dragEl.clientWidth, Math.max(0, dragEl.offsetLeft + posDiffX));
		newPosY = Math.min(document.body.clientHeight - dragEl.clientHeight, Math.max(0, dragEl.offsetTop + posDiffY));

		positionElement();
	}

	window.addEventListener("resize", () => {
		ensureInBounds();
	});

	function closeDragElement() {
		// stop moving when mouse button is released:
		document.onmouseup = null;
		document.onmousemove = null;
	}
}

export class ComfyDialog {
	constructor() {
		this.element = $el("div.comfy-modal", {parent: document.body}, [
			$el("div.comfy-modal-content", [$el("p", {$: (p) => (this.textElement = p)}), ...this.createButtons()]),
		]);
	}

	createButtons() {
		return [
			$el("button", {
				type: "button",
				textContent: "Close",
				"data-i18n-key": "actions.close",
				onclick: () => this.close(),
			}),
		];
	}

	close() {
		this.element.style.display = "none";
	}

	show(html) {
		if (typeof html === "string") {
			this.textElement.innerHTML = html;
		} else {
			this.textElement.replaceChildren(html);
		}
		this.element.style.display = "flex";
	}
}

class ComfySettingsDialog extends ComfyDialog {
	constructor() {
		super();
		this.element = $el("dialog", {
			id: "comfy-settings-dialog",
			parent: document.body,
		}, [
			$el("table.comfy-modal-content.comfy-table", [
				$el("caption", {
					textContent: "Settings",
					"data-i18n-key": "dialogs.settings.title",
				}),
				$el("tbody", {$: (tbody) => (this.textElement = tbody)}),
				$el("button", {
					type: "button",
					textContent: "Close",
					"data-i18n-key": "actions.close",
					style: {
						cursor: "pointer",
					},
					onclick: () => {
						this.element.close();
					},
				}),
			]),
		]);
		this.settings = [];
	}

	getSettingValue(id, defaultValue) {
		const settingId = "Comfy.Settings." + id;
		const v = localStorage[settingId];
		return v == null ? defaultValue : JSON.parse(v);
	}

	setSettingValue(id, value) {
		const settingId = "Comfy.Settings." + id;
		localStorage[settingId] = JSON.stringify(value);
	}

	addSetting({id, name, type, defaultValue, onChange, i18nKey, attrs = {}, tooltip = ""}) {
		if (!id) {
			throw new Error("Settings must have an ID");
		}

		if (this.settings.find((s) => s.id === id)) {
			throw new Error(`Setting ${id} of type ${type} must have a unique ID.`);
		}

		const settingId = `Comfy.Settings.${id}`;
		const v = localStorage[settingId];
		let value = v == null ? defaultValue : JSON.parse(v);

		// Trigger initial setting of value
		if (onChange) {
			onChange(value, undefined);
		}

		this.settings.push({
			render: () => {
				const setter = (v) => {
					if (onChange) {
						onChange(v, value);
					}
					localStorage[settingId] = JSON.stringify(v);
					value = v;
				};
				value = this.getSettingValue(id, defaultValue);

				let element;
				const htmlID = id.replaceAll(".", "-");

				let translation = name;
				if (i18nKey !== undefined) {
					const keys = i18nKey.split(".");
					translation = [...keys, "label"].reduce((acc, curr) => (acc && acc[curr]) ? acc[curr] : null, app.ui.translations);
				}

				const labelCell = $el("td", [
					$el("label", {
						for: htmlID,
						classList: [tooltip !== "" ? "comfy-tooltip-indicator" : ""],
						textContent: translation ? translation : name,
						"data-i18n-key": `${i18nKey}.label`,
					})
				]);

				if (typeof type === "function") {
					element = type(name, setter, value, attrs);
				} else {
					switch (type) {
						case "boolean":
							element = $el("tr", [
								labelCell,
								$el("td", [
									$el("input", {
										id: htmlID,
										type: "checkbox",
										checked: value,
										onchange: (event) => {
											const isChecked = event.target.checked;
											if (onChange !== undefined) {
												onChange(isChecked)
											}
											this.setSettingValue(id, isChecked);
										},
									}),
								]),
							])
							break;
						case "number":
							element = $el("tr", [
								labelCell,
								$el("td", [
									$el("input", {
										type,
										value,
										id: htmlID,
										oninput: (e) => {
											setter(e.target.value);
										},
										...attrs
									}),
								]),
							]);
							break;
						case "slider":
							element = $el("tr", [
								labelCell,
								$el("td", [
									$el("div", {
										style: {
											display: "grid",
											gridAutoFlow: "column",
										},
									}, [
										$el("input", {
											...attrs,
											value,
											type: "range",
											oninput: (e) => {
												setter(e.target.value);
												e.target.nextElementSibling.value = e.target.value;
											},
										}),
										$el("input", {
											...attrs,
											value,
											id: htmlID,
											type: "number",
											style: {maxWidth: "4rem"},
											oninput: (e) => {
												setter(e.target.value);
												e.target.previousElementSibling.value = e.target.value;
											},
										}),
									]),
								]),
							]);
							break;
						case "text":
						default:
							if (type !== "text") {
								console.warn(`Unsupported setting type '${type}, defaulting to text`);
							}

							element = $el("tr", [
								labelCell,
								$el("td", [
									$el("input", {
										value,
										id: htmlID,
										oninput: (e) => {
											setter(e.target.value);
										},
										...attrs,
									}),
								]),
							]);
							break;
					}
				}
				if (tooltip) {
					let translation = tooltip;
					if (i18nKey !== undefined) {
						const keys = `${i18nKey}.tooltip`.split(".");
						translation = keys.reduce((acc, curr) => (acc && acc[curr]) ? acc[curr] : null, app.ui.translations);
					}
					element.querySelector(".comfy-tooltip-indicator").title = translation;
				}

				return element;
			},
		});

		const self = this;
		return {
			get value() {
				return self.getSettingValue(id, defaultValue);
			},
			set value(v) {
				self.setSettingValue(id, v);
			},
		};
	}

	show() {
		this.textElement.replaceChildren(
			$el("tr", {
				style: {display: "none"},
			}, [
				$el("th"),
				$el("th", {style: {width: "33%"}})
			]),
			...this.settings.map((s) => s.render()),
		)
		this.element.showModal();
	}
}

class ComfyList {
	#type;
	#text;

	constructor(text, type) {
		this.#text = text;
		this.#type = type || text.toLowerCase();
		this.element = $el("div.comfy-list");
		this.element.style.display = "none";
	}

	get visible() {
		return this.element.style.display !== "none";
	}

	async load() {
		const items = await api.getItems(this.#type);
		this.element.replaceChildren(
			...Object.keys(items).flatMap((section) => [
				$el("h4", {
					textContent: app.ui.translations.mainMenu[this.#type][section.toLowerCase()],
				}),
				$el("div.comfy-list-items", [
					...items[section].map((item) => {
						// Allow items to specify a custom remove action (e.g. for interrupt current prompt)
						const removeAction = item.remove || {
							name: app.ui.translations.actions.delete,
							cb: () => api.deleteItem(this.#type, item.prompt[1]),
						};
						return $el("div", {textContent: item.prompt[0] + ": "}, [
							$el("button", {
								textContent: app.ui.translations.actions.load,
								onclick: () => {
									app.loadGraphData(item.prompt[3].extra_pnginfo.workflow);
									if (item.outputs) {
										app.nodeOutputs = item.outputs;
									}
								},
							}),
							$el("button", {
								textContent: removeAction.name,
								onclick: async () => {
									await removeAction.cb();
									await this.update();
								},
							}),
						]);
					}),
				]),
			]),
			$el("div.comfy-list-actions", [
				$el("button", {
					textContent: app.ui.translations.mainMenu[this.#text.toLowerCase()].clear,
					onclick: async () => {
						await api.clearItems(this.#type);
						await this.load();
					},
				}),
				$el("button", {
					textContent: app.ui.translations.actions.refresh,
					onclick: () => this.load(),
				}),
			])
		);
	}

	async update() {
		if (this.visible) {
			await this.load();
		}
	}

	async show() {
		this.element.style.display = "block";
		this.button.textContent = app.ui.translations.actions.close;

		await this.load();
	}

	hide() {
		this.element.style.display = "none";
		this.button.textContent = app.ui.translations.mainMenu[this.#text.toLowerCase()].view;
	}

	toggle() {
		if (this.visible) {
			this.hide();
			return false;
		} else {
			this.show();
			return true;
		}
	}
}

export class ComfyUI {
	constructor(app) {
		this.app = app;
		this.dialog = new ComfyDialog(this.translations);
		this.settings = new ComfySettingsDialog();

		this.batchCount = 1;
		this.lastQueueSize = 0;
		this.queue = new ComfyList("Queue");
		this.history = new ComfyList("History");

		/**
		 * Stores the app's translations for the selected language.
		 * @type {import("types/comfy").ComfyObjectTranslations}
		 */
		this.translations = {};

		api.addEventListener("status", () => {
			this.queue.update();
			this.history.update();
		});

		const confirmClear = this.settings.addSetting({
			id: "Comfy.ConfirmClear",
			name: "Require confirmation when clearing workflow",
			type: "boolean",
			defaultValue: true,
			i18nKey: "extensions.core.confirmClear"
		});

		const promptFilename = this.settings.addSetting({
			id: "Comfy.PromptFilename",
			name: "Prompt for filename when saving workflow",
			type: "boolean",
			defaultValue: true,
			i18nKey: "extensions.core.promptFilename"
		});

		/**
		 * file format for preview
		 *
		 * format;quality
		 *
		 * ex)
		 * webp;50 -> webp, quality 50
		 * jpeg;80 -> rgb, jpeg, quality 80
		 *
		 * @type {string}
		 */
		const previewImage = this.settings.addSetting({
			id: "Comfy.PreviewFormat",
			name: "When displaying a preview in the image widget, convert it to a lightweight image, e.g. webp, jpeg, webp;50, etc.",
			type: "text",
			defaultValue: "",
			i18nKey: "extensions.core.previewFormat"
		});

		const fileInput = $el("input", {
			id: "comfy-file-input",
			type: "file",
			accept: ".json,image/png,.latent",
			style: {display: "none"},
			parent: document.body,
			onchange: () => {
				app.handleFile(fileInput.files[0]);
			},
		});

		this.menuContainer = $el("div.comfy-menu", {parent: document.body}, [
			$el("div.drag-handle", {
				style: {
					overflow: "hidden",
					position: "relative",
					width: "100%",
					cursor: "default"
				}
			}, [
				$el("span.drag-handle"),
				$el("span", {$: (q) => (this.queueSize = q)}),
				$el("button.comfy-settings-btn", {textContent: "⚙️", onclick: () => this.settings.show()}),
			]),
			$el("button.comfy-queue-btn", {
				id: "queue-button",
				textContent: "Queue Prompt",
				"data-i18n-key": "mainMenu.queue.prompt",
				onclick: () => app.queuePrompt(0, this.batchCount),
			}),
			$el("div", {}, [
				$el("label", {
					textContent: "Extra options",
					"data-i18n-key": "mainMenu.extraOptions.label",
					for: "Comfy.Menu.ExtraOptions",
				}),
				$el("input", {
					id: "Comfy.Menu.ExtraOptions",
					type: "checkbox",
					onchange: (event) => {
						document.getElementById("extraOptions").style.display = event.target.checked ? "block" : "none";
						this.batchCount = event.target.checked ? document.querySelector("#batchCountInputNumber").value : 1;
						document.getElementById("autoQueueCheckbox").checked = false;
					},
				})
			]),
			$el("div", {id: "extraOptions", style: {width: "100%", display: "none"}}, [
				$el("div", [
					$el("label", {
						for: "batchCountInputNumber",
						textContent: "Batch count",
						"data-i18n-key": "mainMenu.extraOptions.batchCount",
					}),
					$el("input", {
						id: "batchCountInputNumber",
						type: "number",
						value: this.batchCount,
						min: "1",
						style: {width: "35%", "margin-left": "0.4em"},
						oninput: (event) => {
							this.batchCount = event.target.value;
							//event.target.value = this.batchCount;
						},
					}),
				]),
				$el("input", {
					id: "autoQueueCheckbox",
					type: "checkbox",
					classList: ["comfy-tooltip-indicator"],
					checked: false,
					title: "Automatically queue prompt when the queue size hits 0",
					"data-i18n-key": "mainMenu.extraOptions.autoQueue",
				}),
			]),
			$el("div.comfy-menu-btns", [
				$el("button", {
					id: "queue-front-button",
					textContent: "Queue Front",
					"data-i18n-key": "mainMenu.queue.front",
					onclick: () => app.queuePrompt(-1, this.batchCount)
				}),
				$el("button", {
					$: (b) => (this.queue.button = b),
					id: "comfy-view-queue-button",
					textContent: "View Queue",
					"data-i18n-key": "mainMenu.queue.view",
					onclick: () => {
						this.history.hide();
						this.queue.toggle();
					},
				}),
				$el("button", {
					$: (b) => (this.history.button = b),
					id: "comfy-view-history-button",
					textContent: "View History",
					"data-i18n-key": "mainMenu.history.view",
					onclick: () => {
						this.queue.hide();
						this.history.toggle();
					},
				}),
			]),
			this.queue.element,
			this.history.element,
			$el("button", {
				id: "comfy-save-button",
				textContent: "Save",
				"data-i18n-key": "actions.save",
				onclick: () => {
					let filename = "workflow.json";
					if (promptFilename.value) {
						filename = prompt("Save workflow as:", filename);
						if (!filename) return;
						if (!filename.toLowerCase().endsWith(".json")) {
							filename += ".json";
						}
					}
					const json = JSON.stringify(app.graph.serialize(), null, 2); // convert the data to a JSON string
					const blob = new Blob([json], {type: "application/json"});
					const url = URL.createObjectURL(blob);
					const a = $el("a", {
						href: url,
						download: filename,
						style: {display: "none"},
						parent: document.body,
					});
					a.click();
					setTimeout(function () {
						a.remove();
						window.URL.revokeObjectURL(url);
					}, 0);
				},
			}),
			$el("button", {
				id: "comfy-load-button",
				textContent: "Load",
				"data-i18n-key": "actions.load",
				onclick: () => fileInput.click(),
			}),
			$el("button", {
				id: "comfy-refresh-button",
				textContent: "Refresh",
				"data-i18n-key": "actions.refresh",
				onclick: () => app.refreshComboInNodes()
			}),
			$el("button", {
				id: "comfy-clipspace-button",
				textContent: "Clipspace",
				"data-i18n-key": "mainMenu.clipspace.label",
				onclick: () => app.openClipspace(),
			}),
			$el("button", {
				id: "comfy-clear-button",
				textContent: "Clear",
				"data-i18n-key": "actions.clear",
				onclick: () => {
					if (!confirmClear.value || confirm("Clear workflow?")) {
						app.clean();
						app.graph.clear();
					}
				},
			}),
			$el("button", {
				id: "comfy-load-default-button",
				textContent: "Load Default",
				"data-i18n-key": "mainMenu.loadDefault.label",
				onclick: () => {
					if (!confirmClear.value || confirm("Load default workflow?")) {
						app.loadGraphData()
					}
				},
			}),
		])
		;

		dragElement(this.menuContainer, this.settings);

		this.setStatus({exec_info: {queue_remaining: "X"}});
	}

	setStatus(status) {
		this.queueSize.textContent = "Queue size: " + (status ? status.exec_info.queue_remaining : "ERR");
		if (status) {
			if (
				this.lastQueueSize != 0 &&
				status.exec_info.queue_remaining == 0 &&
				document.getElementById("autoQueueCheckbox").checked
			) {
				app.queuePrompt(0, this.batchCount);
			}
			this.lastQueueSize = status.exec_info.queue_remaining;
		}
	}

	async setLocale(newLocale) {
		if (newLocale === this.selectedLocale) {
			return;
		}
		this.selectedLocale = newLocale;

		const res = await fetch(`/locales/${newLocale}.json`);
		this.translations = await res.json();

		document.querySelectorAll("[data-i18n-key]")
			.forEach(el => {
				const keys = el.getAttribute("data-i18n-key").split(".");
				const translation = keys.reduce((acc, curr) => (acc && acc[curr]) ? acc[curr] : null, this.translations);
				if (["INPUT"].includes(el.tagName)) {
					el.value = translation ? translation : el.value;
				} else {
					el.innerText = translation ? translation : el.innerText;
				}
			});

		document.querySelectorAll(".comfy-tooltip-indicator")
			.forEach(el => {
				const key = el.getAttribute("data-i18n-key");
				let translation = el.title;
				if (key !== null) {
					const keys = key.replace(".label", "").split(".");
					translation = [...keys, "tooltip"].reduce((acc, curr) => (acc && acc[curr]) ? acc[curr] : null, this.translations);
				}
				el.title = translation;
			});

		const nodes = [...Object.values(LiteGraph.registered_node_types), ...Object.values(LiteGraph.Nodes)];
		nodes.forEach(n => {
			const title = this.translations.nodes[n.comfyClass ? n.comfyClass : n.name];
			n.title = title ? title : n.name;

			n.category = n.category
				.split("/")
				.map(c => {
					const translation = this.translations.nodes.categories[c];
					return translation ? translation : c;
				})
				.join("/");
		});
	}
}
