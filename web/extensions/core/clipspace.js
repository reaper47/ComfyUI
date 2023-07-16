import { app } from "../../scripts/app.js";
import { ComfyDialog, $el } from "../../scripts/ui.js";
import { ComfyApp } from "../../scripts/app.js";

export class ClipspaceDialog extends ComfyDialog {
	static items = [];
	static instance = null;

	constructor() {
		super();
	}

	static registerButton(name, contextPredicate, callback) {
		ClipspaceDialog.items.push($el("button", {
			type: "button",
			textContent: name,
			contextPredicate: contextPredicate,
			onclick: callback,
			style: {
				width: "100%",
			},
		}));
	}

	static invalidatePreview() {
		if (ComfyApp.clipspace && ComfyApp.clipspace.imgs && ComfyApp.clipspace.imgs.length > 0) {
			const img_preview = document.getElementById("clipspace_preview");
			if (img_preview) {
				img_preview.src = ComfyApp.clipspace.imgs[ComfyApp.clipspace['selectedIndex']].src;
				img_preview.style.maxHeight = "100%";
				img_preview.style.maxWidth = "100%";
			}
		}
	}

	static invalidate() {
		if (ClipspaceDialog.instance) {
			const self = ClipspaceDialog.instance;
			// allow reconstruct controls when copying from non-image to image content.
			const children = $el("table.comfy-modal-content.comfy-table", [
				...self.createImgSettings(),
				...self.createButtons(),
			]);

			if (self.element) {
				// update
				self.element.removeChild(self.element.firstChild);
				self.element.appendChild(children);
			} else {
				// new
				self.element = $el("dialog", {parent: document.body}, [children,]);
			}

			if (self.element.children[0].children.length <= 1) {
				self.element.children[0].prepend($el("p", ["Unable to find the features to edit content of a format stored in the current Clipspace."]));
			}

			ClipspaceDialog.invalidatePreview();
		}
	}

	createButtons() {
		const extraButtons = ClipspaceDialog.items.filter(item => !item.contextPredicate || item.contextPredicate());
		if (extraButtons.length > 0) {
			this.element.style.padding = "0";
		}

		return [
			$el("tfoot", [
				...extraButtons.map(el => $el("td", {
					style: {
						padding: 0,
					},
				}, [el])),
				$el("td", {
					style: {
						padding: 0,
					}
				}, [
					$el("button", {
						type: "button",
						textContent: "Close",
						onclick: () => {
							this.close();
						},
						style: {
							width: "100%",
						},
					})
				])
			])
		];
	}

	createImgSettings() {
		if (ComfyApp.clipspace.imgs) {
			const combo_items = ComfyApp.clipspace.imgs.map((_, i) => $el("option", {value: i}, [`${i}`]));

			const combo1 = $el("select", {
				id: "clipspace_img_selector",
				onchange: (event) => {
					ComfyApp.clipspace['selectedIndex'] = event.target.selectedIndex;
					ClipspaceDialog.invalidatePreview();
				},
				style: {
					width: "100%",
				},
			}, combo_items);

			const row1 = $el("tr", [
				$el("td", [
					$el("label", {
						for: "clipspace_img_selector",
						textContent: "Select image",
					}),
				]),
				$el("td", [combo1])
			]);

			const combo2 = $el("select", {
				id: "clipspace_img_paste_mode",
				onchange: (event) => {
					ComfyApp.clipspace['img_paste_mode'] = event.target.value;
				},
				style: {
					width: "100%",
				},
			}, [
				$el("option", {value: 'selected'}, 'selected'),
				$el("option", {value: 'all'}, 'all')
			]);
			combo2.value = ComfyApp.clipspace['img_paste_mode'];

			const row2 = $el("tr", [
				$el("td", [
					$el("label", {
						for: "clipspace_img_selector",
						textContent: "Paste mode",
					}),
				]),
				$el("td", [combo2]),
			]);

			const row3 = $el("tr", [
				$el("td", {
					colSpan: 2,
					height: "150px",
					style: {
						textAlign: "center",
					},
				}, [this.createImgPreview()])
			]);

			return [row1, row2, row3];
		}
		return [];
	}

	createImgPreview() {
		if (ComfyApp.clipspace.imgs) {
			return $el("img", {
				id: "clipspace_preview",
				ondragstart: () => false,
			});
		}
		return [];
	}

	show() {
		ClipspaceDialog.invalidate();
		this.element.showModal();
	}
}

app.registerExtension({
	name: "Comfy.Clipspace",
	init(app) {
		app.openClipspace = function () {
			if (!ClipspaceDialog.instance) {
				ClipspaceDialog.instance = new ClipspaceDialog(app);
				ComfyApp.clipspace_invalidate_handler = ClipspaceDialog.invalidate;
			}

			if (ComfyApp.clipspace) {
				ClipspaceDialog.instance.show();
			} else {
				app.ui.dialog.show("Clipspace is empty.");
			}
		};
	}
});