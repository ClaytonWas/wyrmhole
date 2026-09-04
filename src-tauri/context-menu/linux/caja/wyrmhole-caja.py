# Install to ~/.local/share/caja-python/extensions/ and restart Caja
# (caja -q). Requires the python3-caja package; without it, use the scripts
# entry in ../scripts/ instead - it needs no extra packages.
# "Send via wyrmhole" - Caja extension written by wyrmhole.
# Toggling Settings -> Right-Click "Send via wyrmhole" off deletes this file.
import subprocess

import gi

for _version in ("2.0",):
    try:
        gi.require_version("Caja", _version)
        break
    except ValueError:
        continue

from gi.repository import GObject, Caja  # noqa: E402

WYRMHOLE = "/usr/bin/wyrmhole"


class WyrmholeMenuProvider(GObject.GObject, Caja.MenuProvider):
    def _launch(self, _menu, files):
        paths = [f.get_location().get_path() for f in files]
        paths = [p for p in paths if p]
        if paths:
            subprocess.Popen([WYRMHOLE, *paths])

    def _item(self, files):
        item = Caja.MenuItem(
            name="WyrmholeMenuProvider::send",
            label="Send via wyrmhole",
            tip="Send the selected files/folders via wyrmhole",
            icon="wyrmhole",
        )
        item.connect("activate", self._launch, files)
        return [item]

    # Nautilus 4 passes (files); Nautilus 3 and Caja pass (window, files).
    def get_file_items(self, *args):
        files = args[-1]
        return self._item(files) if files else []

    def get_background_items(self, *args):
        folder = args[-1]
        return self._item([folder]) if folder else []
