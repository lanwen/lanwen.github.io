---
title: "Useful bash tips & tricks and functions"
tags: ["bash", "shell", "tips"]
draft: false
---

This stuff can be added to `.bashrc` and used in everyday MacOSX development. 
Some of the tips are organised already in the [my dotfiles](https://github.com/lanwen/dotfiles) repo.

## Random string

```bash
random-string()
{
    cat /dev/urandom | env LC_CTYPE=C tr -dc 'a-zA-Z0-9' | fold -w ${1:-32} | head -n ${1:-1}
}
```

then 

```bash
$ random-string 10 4
hXJJAmt0dE
6y4mYlZ3A4
TAffXSRFfR
cHKcQTPXZj
```

## Java-like UUID

```bash
alias uuidgen='uuidgen | tr "[:upper:]" "[:lower:]"'
```

```bash
$ uuidgen
e66413af-f855-4568-944b-8d3175053672
```

## Timestamp

```bash
alias ts='date +%s'
```

```bash
$ ts
1570480900
```