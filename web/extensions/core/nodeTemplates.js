import { app } from "../../scripts/app.js";
import { ComfyDialog, $el } from "../../scripts/ui.js";

// Adds the ability to save and add multiple nodes as a template
// To save:
// Select multiple nodes (ctrl + drag to select a region or ctrl+click individual nodes)
// Right-click the canvas
// Save Node Template -> give it a name
//
// To add:
// Right-click the canvas
// Node templates -> click the one to add
//
// To delete/rename:
// Right-click the canvas
// Node templates -> Manage

const id = "Comfy.NodeTemplates";

class ManageTemplates extends ComfyDialog {
	constructor() {
		super();
		this.element.classList.add("comfy-manage-templates");
		this.templates = this.load();
	}

	createButtons() {
		const buttons = super.createButtons();
		buttons[0].textContent = "Cancel";
		buttons.push(
			$el("button", {
				type: "button",
				textContent: "Save",
				onclick: () => this.save(),
			})
		);
		return [$el("div", {
			style: {
				display: "grid",
				gridAutoFlow: "column",
				gap: "0.5rem",
			},
		}, buttons)];
	}

	load() {
		const templates = localStorage.getItem(id);
		if (templates) {
			return JSON.parse(templates);
		}
		return [];
	}

	save() {
		// Find all visible inputs and save them as our new list
		const inputs = this.element.querySelectorAll("input");
		const updated = [];

		inputs.forEach((input, i) => {
			const t = this.templates[i];
			t.name = input.value.trim() || input.getAttribute("data-name");
			updated.push(t);
		});

		this.templates = updated;
		this.store();
		this.close();
	}

	store() {
		localStorage.setItem(id, JSON.stringify(this.templates));
	}

	show() {
		// Show list of template names + delete button
		this.element.style.padding = 0;
		const contentDiv = this.element.querySelector(".comfy-modal-content");
		contentDiv.classList.add("comfy-table");

		super.show([
				$el("thead", [
					$el("tr", [
						$el("th", {textContent: "Name"}),
						$el("th"),
					]),
				]),
				$el("tbody", this.templates.flatMap((t) => {
					let nameInput;
					return [
						$el("tr", [
							$el("td", [
								$el("input", {
									value: t.name,
									dataset: {name: t.name},
									$: (el) => (nameInput = el),
								})
							]),
							$el("td", [
								$el("button", {
									textContent: "Delete",
									style: {
										color: "var(--error-text)",
									},
									onclick: (event) => {
										let {target} = event;
										while (target.tagName !== "TR") {
											target = target.parentElement;
										}
										target.remove();
									},
								}),
							]),
						]),
					];
				}))
			]
		);
	}
}

app.registerExtension({
	name: id,
	setup() {
		const manage = new ManageTemplates();

		const clipboardAction = (cb) => {
			// We use the clipboard functions but don't want to overwrite the current user clipboard
			// Restore it after we've run our callback
			const old = localStorage.getItem("litegrapheditor_clipboard");
			cb();
			localStorage.setItem("litegrapheditor_clipboard", old);
		};

		const orig = LGraphCanvas.prototype.getCanvasMenuOptions;
		LGraphCanvas.prototype.getCanvasMenuOptions = function () {
			const options = orig.apply(this, arguments);

			options.push(null);
			options.push({
				content: "Save Selected as Template",
				disabled: !Object.keys(app.canvas.selected_nodes || {}).length,
				callback: () => {
					const name = prompt("Enter name");
					if (!name || !name.trim()) return;

					clipboardAction(() => {
						app.canvas.copyToClipboard();
						manage.templates.push({
							name,
							data: localStorage.getItem("litegrapheditor_clipboard"),
						});
						manage.store();
					});
				},
			});

			// Map each template to a menu item
			const subItems = manage.templates.map((t) => ({
				content: t.name,
				callback: () => {
					clipboardAction(() => {
						localStorage.setItem("litegrapheditor_clipboard", t.data);
						app.canvas.pasteFromClipboard();
					});
				},
			}));

			if (subItems.length) {
				subItems.push(null, {
					content: "Manage",
					callback: () => manage.show(),
				});

				options.push({
					content: "Node Templates",
					submenu: {
						options: subItems,
					},
				});
			}

			return options;
		};
	},
});
