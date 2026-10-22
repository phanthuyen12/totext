import argostranslate.package


def main():
    source, target = "en", "vi"
    argostranslate.package.update_package_index()
    available = argostranslate.package.get_available_packages()
    model = next(
        (item for item in available if item.from_code == source and item.to_code == target),
        None,
    )
    if model is None:
        raise RuntimeError(f"No Argos Translate model available for {source}->{target}")

    package_path = model.download()
    argostranslate.package.install_from_path(package_path)
    print(f"Installed Argos Translate model {source}->{target}")


if __name__ == "__main__":
    main()
