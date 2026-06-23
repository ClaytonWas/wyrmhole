# Nautilus (GNOME Files) extension: adds "Send via wyrmhole" to the right-click
# menu for files and folders. Requires the python3-nautilus (a.k.a.
# nautilus-python) package.
#
# Install per-user:
#   ~/.local/share/nautilus-python/extensions/wyrmhole-nautilus.py
# Install system-wide (what the .deb does):
#   /usr/share/nautilus-python/extensions/wyrmhole-nautilus.py
# Then restart Nautilus:  nautilus -q
#
# Works on both Nautilus 4 (GNOME 42+, GTK4) and the older Nautilus 3 API.

import gi

try:
    gi.require_version("Nautilus", "4.0")
except ValueError:
    gi.require_version("Nautilus", "3.0")

import subprocess

from gi.repository import GObject, Nautilus


class WyrmholeMenuProvider(GObject.GObject, Nautilus.MenuProvider):
    def _launch(self, _menu, files):
        # Local paths only; skip anything without one (e.g. remote/trash URIs).
        paths = [f.get_location().get_path() for f in files]
        paths = [p for p in paths if p]
        if paths:
            subprocess.Popen(["wyrmhole", *paths])

    # Nautilus 4 calls get_file_items(self, files); Nautilus 3 calls
    # get_file_items(self, window, files). Taking the last arg handles both.
    def get_file_items(self, *args):
        files = args[-1]
        if not files:
            return []
        item = Nautilus.MenuItem(
            name="WyrmholeMenuProvider::send",
            label="Send via wyrmhole",
            tip="Send the selected files/folders via wyrmhole",
        )
        item.connect("activate", self._launch, files)
        return [item]
