# librsvg renders the 256-unit viewBox at 96dpi, so 32px wants a density of 12.
public/favicon.ico: public/icon.svg
	magick -background none -density 12 $< -resize 32x32 PNG32:$@
