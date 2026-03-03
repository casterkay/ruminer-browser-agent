#!/bin/bash
tree packages/ -I dist -I tests -I node_modules -I ".*" -L 5 > CODEBASE.txt
tree app/ -I dist -I tests -I node_modules -I ".*" -L 5 >> CODEBASE.txt