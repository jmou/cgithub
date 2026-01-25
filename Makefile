deploy:
	pnpm run build
	rsync -av --del dist elmo:/opt/cgithub
	ssh elmo sudo systemctl restart cgithub
.PHONY: deploy
